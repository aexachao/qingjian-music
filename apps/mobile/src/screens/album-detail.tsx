import { useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import type { Track } from '@qj/core-domain'
import { AmbientHeaderBackground } from '@/components/ambient-header-background'
import { CDSleeveCover } from '@/components/cd-sleeve-cover'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { TrackRow } from '@/components/track-row'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { tap } from '@/lib/haptics'
import { formatAlbumYear, getAlbumAudioSpecBadge } from '@/lib/album-meta'
import { appendTracks, playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { resolveAmbientPalette } from '@/theme/ambient-palette'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { fonts, spacing, typography } from '@/theme/tokens'

/**
 * 专辑详情页 (AlbumDetailScreen):
 * - 沉浸式流体背景：提取封面主导氛围光，经由高斯模糊在头部上方弥散，无缝汇入纯黑深底；
 * - 3D 悬浮实体封面：220pt 封套封面、自适应环境光投影与下拉阻尼弹性放大（Pull-to-Zoom）；
 * - 居中对称排版（8pt 系统）：纯白 H1 标题、浅灰可点击跳转歌手链接、中性灰元数据档案；
 * - 极简音质线框徽章：移除突兀彩色大底块，回归单色半透明超细线框药丸；
 * - 高对比主次按键胶囊：纯白实体播放（黑字）与磨砂玻璃随机播放（白字），校准品牌色滥用；
 * - 滚动吸顶联动：向上越过巨幕后，导航栏平滑过渡为毛玻璃并显现迷你唱片与随手切歌按键；
 * - 列表工具栏：集成「共 x 首 · 可播 xx 分钟」动态时长与 44pt 触控热区的批量多选与排序。
 */
export function AlbumDetailScreen() {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const topHeaderOffset = Math.max(insets.top, 20) + 44
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()
  const router = useRouter()
  const href = useDetailHref()
  const toast = useToast()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()

  // 吸顶折叠高度计算
  const [headerHeight, setHeaderHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  const [pinned, setPinned] = useState(false)
  const pinAt = Math.max(0, headerHeight - barHeight)

  const albumQuery = useQuery({
    queryKey: ['album', connection?.id, id],
    enabled: Boolean(provider && id),
    queryFn: () => provider!.album(id),
  })

  const { selection, setSelection, sortKey, sort } = useListSort('albumTracks')
  const [selecting, setSelecting] = useState(false)
  const { query, items, total, loadMore } = usePagedQuery<Track>({
    queryKey: ['album-tracks', connection?.id, id, sortKey],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.albumTracks(id, { page, size: 100, sort }),
  })

  const album = albumQuery.data

  // 专属流体氛围调色板
  const palette = useMemo(
    () => resolveAmbientPalette(album?.id ?? album?.coverId),
    [album?.id, album?.coverId],
  )

  // 滚动动效与下拉阻尼缩放（Pull-to-Zoom）
  const scrollY = useSharedValue(0)
  const isPinnedSV = useSharedValue(false)

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y
      scrollY.value = y
      const isPast = pinAt > 0 && y >= pinAt
      if (isPast !== isPinnedSV.value) {
        isPinnedSV.value = isPast
        runOnJS(setPinned)(isPast)
      }
    },
  })

  const coverAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      scrollY.value,
      [-180, 0],
      [1.24, 1],
      Extrapolation.CLAMP,
    )
    return {
      transform: [{ scale }],
    }
  })

  const navBgAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [150, 230],
      [0, 1],
      Extrapolation.CLAMP,
    )
    return { opacity }
  })

  const navTitleAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [190, 240],
      [0, 1],
      Extrapolation.CLAMP,
    )
    const translateY = interpolate(
      scrollY.value,
      [190, 240],
      [6, 0],
      Extrapolation.CLAMP,
    )
    return {
      opacity,
      transform: [{ translateY }],
    }
  })

  const navPlayAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [190, 240],
      [0, 1],
      Extrapolation.CLAMP,
    )
    return { opacity }
  })

  // 播放整张专辑
  async function play(startIndex: number, shuffle = false) {
    if (!provider || !connection || items.length === 0) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks: items,
      startIndex,
      source: { kind: 'album', id, label: album?.name ? `专辑 · ${album.name}` : '专辑' },
    })
    if (shuffle) await toggleShuffle()
  }

  // 菜单动作：追加到当前播放队列
  const handleAppendToQueue = async () => {
    if (!provider || !connection || items.length === 0) {
      toast('专辑没有歌曲可添加')
      return
    }
    try {
      await appendTracks({ provider, serverId: connection.id, tracks: items })
      toast(`已添加 ${items.length} 首歌曲到队列`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败')
    }
  }

  // 菜单动作：跳转艺术家
  const handleGotoArtist = () => {
    const firstArtist = album?.artists[0]
    if (firstArtist?.id) {
      router.push(href.artist(firstArtist.id))
    }
  }

  const menuActions: MenuAction[] = useMemo(() => {
    const actions: MenuAction[] = [
      {
        id: 'append-to-queue',
        title: '添加到当前播放队列',
        image: Platform.OS === 'ios' ? 'text.badge.plus' : undefined,
      },
    ]
    if (album?.artists[0]?.id) {
      actions.push({
        id: 'goto-artist',
        title: '查看艺术家',
        image: Platform.OS === 'ios' ? 'music.mic' : undefined,
      })
    }
    return actions
  }, [album?.artists])

  const handleMenuAction = ({ nativeEvent }: NativeActionEvent) => {
    switch (nativeEvent.event) {
      case 'append-to-queue':
        void handleAppendToQueue()
        break
      case 'goto-artist':
        handleGotoArtist()
        break
    }
  }

  const artistText = album?.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'
  const firstArtistId = album?.artists[0]?.id

  // 规格与数据统计
  const specBadge = useMemo(() => getAlbumAudioSpecBadge(items), [items])
  const formattedYear = useMemo(() => formatAlbumYear(album?.releaseDate), [album?.releaseDate])
  const totalDurationMs = useMemo(
    () => items.reduce((acc, track) => acc + (track.durationMs || 0), 0),
    [items],
  )

  const isMenuOpen = useIsMenuOpen()

  if (albumQuery.isPending) return <LoadingState />
  if (albumQuery.isLoadingError) return <ErrorState error={albumQuery.error} onRetry={() => void albumQuery.refetch()} />
  if (!album) return <EmptyState text="专辑不存在" />

  const toolbar = (
    <ListToolbar
      kind="albumTracks"
      total={total}
      totalDurationMs={totalDurationMs}
      selection={selection}
      onSelect={setSelection}
      onStartSelection={() => setSelecting(true)}
    />
  )

  return (
    <View style={styles.root}>
      {/* 顶部自适应毛玻璃导航栏 */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          title: '',
          headerLeft: () => <StackBackButton />,
          headerBackground: () => (
            <Animated.View style={[StyleSheet.absoluteFill, navBgAnimatedStyle]} pointerEvents="none">
              <BlurView
                tint={mode === 'dark' ? 'dark' : 'light'}
                intensity={100}
                style={StyleSheet.absoluteFill}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgFloatingBlur, opacity: 0.7 }]} />
              <View style={[styles.navBottomBorder, { backgroundColor: colors.borderSubtle }]} />
            </Animated.View>
          ),
          headerTitle: () => (
            <Animated.View style={[styles.navTitleRow, navTitleAnimatedStyle]}>
              <CoverImage coverId={album.coverId} size={28} borderRadius={4} />
              <Text style={styles.navTitleText} numberOfLines={1}>
                {album.name}
              </Text>
            </Animated.View>
          ),
          headerRight: () => (
            <View style={styles.navRightRow}>
              <Animated.View style={navPlayAnimatedStyle}>
                <Pressable
                  hitSlop={8}
                  style={styles.navPlayButton}
                  onPress={() => {
                    tap()
                    void play(0)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部"
                >
                  <Icon name="play" size={16} color={colors.textPrimary} filled />
                </Pressable>
              </Animated.View>
              <MenuView
                title={album.name}
                themeVariant={mode === 'dark' ? 'dark' : 'light'}
                shouldOpenOnLongPress={false}
                isAnchoredToRight={true}
                actions={menuActions}
                onPressAction={handleMenuAction}
              >
                <View
                  style={styles.moreButton}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="专辑菜单"
                >
                  <Icon name="more" size={iconSize.md} color={colors.textPrimary} />
                </View>
              </MenuView>
            </View>
          ),
        }}
      />

      {/* 顶部柔和流体弥散氛围光底色 */}
      <AmbientHeaderBackground palette={palette} />

      <Animated.FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingTop: topHeaderOffset + spacing.xs, paddingBottom: bottom },
        ]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        ListHeaderComponent={
          <View style={styles.headerRoot} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <View style={styles.coverBlock}>
              {/* 大封面封套与景深阴影 */}
              <Animated.View style={[styles.coverContainer, coverAnimatedStyle]}>
                <View style={[styles.coverGlow, { shadowColor: palette.primary }]}>
                  <CDSleeveCover coverId={album.coverId} size={180} />
                </View>
              </Animated.View>

              {/* 专辑标题（24pt Bold 纯白，居中对齐） */}
              <Text style={styles.name} numberOfLines={2}>
                {album.name}
              </Text>

              {/* 艺术家名称（16pt Medium 浅灰，支持点击无缝跳转，彻底告别红字） */}
              {firstArtistId ? (
                <Pressable
                  onPress={handleGotoArtist}
                  hitSlop={8}
                  style={({ pressed }) => [styles.artistLink, pressed && styles.artistLinkPressed]}
                  accessibilityRole="link"
                  accessibilityLabel={`查看艺术家 ${artistText}`}
                >
                  <Text style={styles.artistText} numberOfLines={1}>
                    {artistText}
                  </Text>
                  <Icon name="chevronRight" size={13} color={colors.textTertiary} />
                </Pressable>
              ) : (
                <Text style={styles.artistText} numberOfLines={1}>
                  {artistText}
                </Text>
              )}

              {/* 精炼元数据：年份 · 规格徽章（中性灰微型药丸，无红字与彩色大块） */}
              {formattedYear || specBadge ? (
                <View style={styles.metaRow}>
                  {formattedYear ? <Text style={styles.metaText}>{formattedYear}</Text> : null}
                  {formattedYear && specBadge ? <Text style={styles.metaDot}>·</Text> : null}
                  {specBadge ? (
                    <View style={styles.specBadge} accessible accessibilityLabel={`音频规格 ${specBadge}`}>
                      <Text style={styles.specBadgeText}>{specBadge}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* 核心动作：高对比主次双胶囊（纯白播放全部 + 磨砂玻璃随机播放） */}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}
                  onPress={() => {
                    tap()
                    void play(0)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="播放专辑全部歌曲"
                >
                  <Icon name="play" size={16} color={colors.ctaPrimaryText} filled />
                  <Text style={styles.playButtonLabel}>播放全部</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.shuffleButton, pressed && styles.buttonPressed]}
                  onPress={() => {
                    tap()
                    void play(0, true)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="随机播放专辑"
                >
                  <Icon name="shuffle" size={16} color={colors.textPrimary} />
                  <Text style={styles.shuffleButtonLabel}>随机播放</Text>
                </Pressable>
              </View>
            </View>

            {/* 列表工具栏（排序与批量多选入口） */}
            <View style={styles.toolbarSlot} onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}>
              {toolbar}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            leading="index"
            playing={current?.serverId === connection?.id && current?.trackId === item.id}
            onPress={() => void play(index)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          <PaginationFooter
            loading={query.isFetchingNextPage}
            error={query.isFetchNextPageError ? query.error : undefined}
            onRetry={() => void query.fetchNextPage()}
          />
        }
      />

      {/* 滚动过头部后吸附顶部的精简工具条 */}
      {pinned && total > 0 ? (
        <View style={[styles.pinnedBar, { top: topHeaderOffset }]}>
          {toolbar}
        </View>
      ) : null}

      {/* 批量操作模态弹窗（同步切为 leading="index"） */}
      <TrackSelectionModal
        visible={selecting}
        items={items}
        source={{ kind: 'album', id, label: album?.name ? `专辑 · ${album.name}` : '专辑' }}
        leading="index"
        isPlaying={(trackId) => current?.serverId === connection?.id && current?.trackId === trackId}
        onEndReached={loadMore}
        footer={
          <PaginationFooter
            loading={query.isFetchingNextPage}
            error={query.isFetchNextPageError ? query.error : undefined}
            onRetry={() => void query.fetchNextPage()}
          />
        }
        onClose={() => setSelecting(false)}
      />

      {/* 快捷菜单打开时的全屏透明拦截遮罩 */}
      {isMenuOpen ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {}}
        />
      ) : null}
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  headerRoot: {
    marginBottom: spacing.xs,
  },
  coverBlock: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  coverContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverGlow: {
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.38,
    shadowRadius: 32,
    elevation: 12,
  },
  name: {
    ...typography.title,
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 34,
    paddingHorizontal: spacing.lg,
    lineHeight: 30,
  },
  artistLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  artistLinkPressed: {
    opacity: 0.7,
  },
  artistText: {
    ...typography.subhead,
    fontSize: 16,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  metaText: {
    ...typography.caption,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
  },
  metaDot: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textTertiary,
  },
  specBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.badgeBorder,
    backgroundColor: colors.badgeBg,
    marginLeft: 2,
  },
  specBadgeText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.badgeText,
    letterSpacing: 0.4,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 22,
    width: '100%',
    paddingHorizontal: spacing.sm,
  },
  playButton: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: 22,
    backgroundColor: colors.ctaPrimaryBg,
  },
  playButtonLabel: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.ctaPrimaryText,
  },
  shuffleButton: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: 22,
    backgroundColor: colors.bgButtonSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
  },
  shuffleButtonLabel: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  moreButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  toolbarSlot: {
    alignSelf: 'stretch',
    marginTop: 24,
    marginBottom: 12,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  pinnedBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    backgroundColor: colors.bgPrimary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  separator: {
    height: 1,
    marginLeft: 48,
    backgroundColor: colors.borderSubtle,
  },
  navBottomBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  navTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 220,
  },
  navTitleText: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  navRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  navPlayButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
}))
