import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import type { Genre } from '@qj/core-domain'
import { CollapsibleHeaderBar, LargeTitleHeader } from '@/components/collapsible-tab-header'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { ErrorState } from '@/components/list-states'
import { SearchFieldShell } from '@/components/search-field'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { useServerSession } from '@/lib/server-session'
import { playTrackList } from '@/player/controller'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/** 流派卡片直接播放时取多少首 */
const GENRE_LIMIT = 30
const GENRE_PLAY_SIZE = 100

/**
 * 搜索 · **浏览态**（第 9 轮的三个状态之一）：大标题 + 搜索框（假框）+ 按流派收听。
 *
 * 搜索框是个**按钮**不是输入框 —— 点它进「搜索态」（`/search/query`），真输入框在那里由
 * 导航栏承载（2026-09-15 拍板的 A 方案）。这样这一屏没有任何常驻元素，滚动时大标题正常
 * 收起，手感与首页 / 音乐库 / 设置完全一致，也就不会再出现「大标题 + 固定搜索框 + 键盘」
 * 三者打架。
 */
export function SearchBrowseScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const { q } = useLocalSearchParams<{ q?: string }>()
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const router = useRouter()
  const toast = useToast()
  const isMenuOpen = useIsMenuOpen()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  const genres = useQuery({
    queryKey: ['search-genres', connection?.id],
    enabled: Boolean(provider) && Boolean(provider?.capabilities.genres),
    queryFn: () => provider!.genres({ page: 1, size: GENRE_LIMIT }),
  })

  /** 流派卡片上的播放键：直接把这个流派放起来，不用先进二级页 */
  const playGenre = useCallback(
    async (genre: Genre) => {
      if (!provider || !connection) return
      try {
        const page = await provider.genreTracks(genre.id, { page: 1, size: GENRE_PLAY_SIZE })
        if (page.items.length === 0) {
          toast('这个流派下还没有歌曲')
          return
        }
        await playTrackList({
          provider,
          serverId: connection.id,
          tracks: page.items,
          startIndex: 0,
          source: { kind: 'genre', id: genre.id, label: `流派 · ${genre.name}` },
        })
        toast(`开始播放 ${genre.name}`)
      } catch {
        toast('播放失败，请稍后再试')
      }
    },
    [connection, provider, toast],
  )

  // 带关键词进来（老链接 /search?q=…）：直接落到搜索态，别再让用户点一次
  if (q && q.trim()) {
    return <Redirect href={{ pathname: '/search/query', params: { q } }} />
  }

  return (
    <View style={{ flex: 1 }}>
      <CollapsibleHeaderBar title="搜索" scrollY={scrollY} />
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        keyboardShouldPersistTaps="handled"
      >
        <LargeTitleHeader title="搜索" scrollY={scrollY} />

        <Pressable
          style={({ pressed }) => (pressed ? styles.searchBoxPressed : undefined)}
          onPress={() => router.push('/search/query')}
          accessibilityRole="search"
          accessibilityLabel="搜索曲库"
        >
          <SearchFieldShell>
            <Icon name="search" size={iconSize.md} color={colors.iconDim} />
            <Text style={styles.placeholder}>搜索歌曲、专辑、艺术家</Text>
          </SearchFieldShell>
        </Pressable>

        <Text style={styles.sectionTitle}>按流派收听</Text>
        {genres.isError ? (
          <ErrorState error={genres.error} onRetry={() => void genres.refetch()} />
        ) : (
          <View style={styles.genreGrid}>
            {(genres.data?.items ?? []).map((genre) => (
              <View key={genre.id} style={styles.genreCard}>
                <Pressable
                  style={styles.genreMain}
                  onPress={() => router.push(href.genre(genre.id, genre.name))}
                  accessibilityRole="button"
                  accessibilityLabel={`流派 ${genre.name}`}
                >
                  <Text numberOfLines={1} style={styles.genreName}>
                    {genre.name}
                  </Text>
                  {genre.trackCount ? <Text style={styles.genreMeta}>{genre.trackCount} 首</Text> : null}
                </Pressable>
                <IconButton
                  name="play"
                  size={iconSize.md}
                  color={colors.brandTint}
                  onPress={() => void playGenre(genre)}
                  accessibilityLabel={`播放流派 ${genre.name}`}
                />
              </View>
            ))}
          </View>
        )}
      </Animated.ScrollView>

      {isMenuOpen ? <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} /> : null}
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  content: { paddingHorizontal: spacing.lg, paddingTop: 0, gap: spacing.sm },
  searchBoxPressed: { opacity: 0.7 },
  placeholder: { flex: 1, ...typography.callout, color: colors.textTertiary },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, paddingVertical: spacing.sm },
  // 两列流派卡片：和首页入口卡片同一套尺寸语言
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  genreCard: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
  },
  genreMain: { flex: 1, gap: 2, paddingVertical: spacing.xs },
  genreName: { ...typography.callout, color: colors.textPrimary },
  genreMeta: { ...typography.caption, color: colors.textTertiary },
}))
