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
import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import type { Track } from '@qj/core-domain'
import { AmbientHeaderBackground } from '@/components/ambient-header-background'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, PaginationFooter } from '@/components/list-states'
import { TrackListSkeleton } from '@/components/skeleton'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { TrackRow } from '@/components/track-row'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { appendTracks, playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { resolveAmbientPalette } from '@/theme/ambient-palette'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

/**
 * 我喜欢的音乐 (FavoritesScreen):
 * - 专属红心大画卷：210pt 封套、红心艺术徽章与立体弥散软阴影；
 * - 完备的数据统计：歌曲数量与总播放时长；
 * - 核心双主动作胶囊：大号「播放全部」与「随机播放」；
 * - 原生操作菜单：一键将我喜欢的歌曲追加到当前播放队列；
 * - 滚动吸顶联动：越过巨幕后标题平滑折叠，吸顶工具栏支持一键批量多选；
 * - 细分割线与播放态高亮。
 */
export function FavoritesScreen() {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const toast = useToast()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()

  const [headerHeight, setHeaderHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  const [pinned, setPinned] = useState(false)
  const pinAt = Math.max(0, headerHeight - barHeight)

  const { selection, setSelection, sortKey, sort } = useListSort('favorites')
  const [selecting, setSelecting] = useState(false)
  const { query, items, total, loadMore } = usePagedQuery<Track>({
    queryKey: ['favorites', connection?.id, sortKey],
    enabled: Boolean(provider?.favorites),
    fetchPage: (page) => provider!.favorites!({ page, size: 50, sort }),
  })

  // 播放全部
  async function play(startIndex: number, shuffle = false) {
    if (!provider || !connection || items.length === 0) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks: items,
      startIndex,
      source: { kind: 'favorites', label: '我喜欢的音乐' },
    })
    if (shuffle) await toggleShuffle()
  }

  // 菜单动作：追加到当前播放队列
  const handleAppendToQueue = async () => {
    if (!provider || !connection || items.length === 0) {
      toast('还没有收藏的歌曲')
      return
    }
    try {
      await appendTracks({ provider, serverId: connection.id, tracks: items })
      toast(`已添加 ${items.length} 首歌曲到队列`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败')
    }
  }

  const menuActions: MenuAction[] = useMemo(() => [
    {
      id: 'append-to-queue',
      title: '添加到当前播放队列',
      image: Platform.OS === 'ios' ? 'text.badge.plus' : undefined,
    },
  ], [])

  const handleMenuAction = ({ nativeEvent }: NativeActionEvent) => {
    if (nativeEvent.event === 'append-to-queue') {
      void handleAppendToQueue()
    }
  }

  const isMenuOpen = useIsMenuOpen()

  // 提取首曲封面用于大封套
  const firstTrackCoverId = items[0]?.coverId ?? items[0]?.album?.coverId

  // 播放总时长统计（毫秒）
  const totalDurationMs = useMemo(
    () => items.reduce((acc, track) => acc + (track.durationMs || 0), 0),
    [items],
  )

  const insets = useSafeAreaInsets()
  const topHeaderOffset = Math.max(insets.top, 20) + 44

  const palette = useMemo(
    () => resolveAmbientPalette(firstTrackCoverId ?? 'favorites'),
    [firstTrackCoverId],
  )

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

  if (provider && !provider.capabilities.favorites) {
    return <EmptyState text="当前服务器不支持收藏" />
  }

  if (query.isPending && items.length === 0) return <TrackListSkeleton />
  if (query.isLoadingError && items.length === 0) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const toolbar = (
    <ListToolbar
      kind="favorites"
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
              <View style={styles.navHeartBadge}>
                <Icon name="heart" size={14} color={colors.like} filled />
              </View>
              <Text style={styles.navTitleText} numberOfLines={1}>
                我喜欢的音乐
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
                    void play(0)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部"
                >
                  <Icon name="play" size={16} color={colors.textPrimary} filled />
                </Pressable>
              </Animated.View>
              <MenuView
                title="我喜欢的音乐"
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
                  accessibilityLabel="收藏菜单"
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
              {/* 大封面封套与红心艺术标识 */}
              <Animated.View style={[styles.coverContainer, coverAnimatedStyle]}>
                <View style={[styles.coverShadowWrapper, { shadowColor: palette.primary }]}>
                  {firstTrackCoverId ? (
                    <View style={styles.coverRelative}>
                      <CoverImage coverId={firstTrackCoverId} size={210} borderRadius={radius.album} />
                      <View style={styles.heartFloatBadge}>
                        <Icon name="heart" size={24} color={colors.like} filled />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.heroHeartCard}>
                      <Icon name="heart" size={72} color={colors.like} filled />
                    </View>
                  )}
                </View>
              </Animated.View>

              <Text style={styles.name} numberOfLines={1}>
                我喜欢的音乐
              </Text>

              {/* 核心动作：大号播放与随机播放双胶囊 */}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放我喜欢的音乐"
                >
                  <Icon name="play" size={iconSize.sm} color={colors.ctaPrimaryText} filled />
                  <Text style={styles.playButtonLabel}>播放全部</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.shuffleButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0, true)}
                  accessibilityRole="button"
                  accessibilityLabel="随机播放我喜欢的音乐"
                >
                  <Icon name="shuffle" size={iconSize.sm} color={colors.textPrimary} />
                  <Text style={styles.shuffleButtonLabel}>随机播放</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.toolbarSlot} onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}>
              {toolbar}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            leading="cover"
            playing={current?.serverId === connection?.id && current?.trackId === item.id}
            onPress={() => void play(index)}
          />
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyState text="还没有收藏的歌曲" />}
        ListFooterComponent={
          total > 0 ? (
            <PaginationFooter
              loading={query.isFetchingNextPage}
              error={query.isFetchNextPageError ? query.error : undefined}
              onRetry={() => void query.fetchNextPage()}
            />
          ) : null
        }
      />

      {pinned && total > 0 ? (
        <View style={[styles.pinnedBar, { top: topHeaderOffset }]}>
          {toolbar}
        </View>
      ) : null}

      <TrackSelectionModal
        visible={selecting}
        items={items}
        source={{ kind: 'favorites', label: '我喜欢的音乐' }}
        leading="cover"
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
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerRoot: {
    marginBottom: spacing.sm,
  },
  coverBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  coverContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverShadowWrapper: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: spacing.xs,
    borderRadius: radius.album,
  },
  coverRelative: {
    position: 'relative',
  },
  heartFloatBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgModal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  heroHeartCard: {
    width: 210,
    height: 210,
    borderRadius: radius.album,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    ...typography.title,
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    lineHeight: 30,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md + 2,
    width: '100%',
    paddingHorizontal: spacing.xs,
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.pill,
    backgroundColor: colors.ctaPrimaryBg,
  },
  playButtonLabel: {
    ...typography.headline,
    fontFamily: fonts.semibold,
    color: colors.ctaPrimaryText,
  },
  shuffleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
  },
  shuffleButtonLabel: {
    ...typography.headline,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  buttonPressed: {
    opacity: 0.82,
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
    marginTop: spacing.lg,
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
    marginLeft: 60,
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
  navHeartBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
