import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { Link, Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CollapsibleHeaderBar, LargeTitleHeader } from '@/components/collapsible-tab-header'
import { GenreCard } from '@/components/genre-card'
import { Icon, iconSize } from '@/components/icon'
import { ErrorState } from '@/components/list-states'
import { SearchFieldShell } from '@/components/search-field'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

/** 流派卡片列表取多少首 */
const GENRE_LIMIT = 30

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
  const { width } = useWindowDimensions()
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const router = useRouter()
  const isMenuOpen = useIsMenuOpen()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  const columns = 2
  const gap = spacing.md
  const cardWidth = (width - spacing.lg * 2 - gap * (columns - 1)) / columns

  const genres = useQuery({
    queryKey: ['search-genres', connection?.id],
    enabled: Boolean(provider) && Boolean(provider?.capabilities.genres),
    queryFn: () => provider!.genres({ page: 1, size: GENRE_LIMIT }),
  })

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
              <Link key={genre.id} href={href.genre(genre.id, genre.name, genre.coverId)} asChild>
                <Pressable
                  style={{ width: cardWidth }}
                  accessibilityRole="button"
                  accessibilityLabel={`流派 ${genre.name}`}
                >
                  <GenreCard genre={genre} coverId={genre.coverId} width={cardWidth} />
                </Pressable>
              </Link>
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
  // 两列流派黑胶卡片：和流派页同一套卡片与尺寸语言
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
}))
