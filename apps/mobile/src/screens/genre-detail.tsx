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
import { Stack, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import type { Track } from '@qj/core-domain'
import { AmbientHeaderBackground } from '@/components/ambient-header-background'
import { Icon, iconSize } from '@/components/icon'
import { DetailPinnedToolbar } from '@/components/detail-pinned-toolbar'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { TrackRow } from '@/components/track-row'
import { VinylDisc } from '@/components/vinyl-disc'
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
 * 流派详情页 (GenreDetailScreen):
 * - 340pt 标志性黑胶唱片巨幕与动态露出效果；
 * - 完备的流派数据统计：歌曲数量与全流派总播放时长；
 * - 核心双主动作胶囊：大号「播放全部」与「随机播放」；
 * - 原生操作菜单：一键将整流派曲目加入当前播放队列；
 * - 滚动吸顶联动：越过黑胶后标题平滑折叠，吸顶工具栏支持一键批量多选；
 * - 细分割线与播放态高亮。
 */
export function GenreDetailScreen() {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
  const { id, name, coverId: initialCoverId } = useLocalSearchParams<{ id: string; name?: string; coverId?: string }>()
  const { provider, connection } = useServerSession()
  const toast = useToast()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()

  const [headerHeight, setHeaderHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  const [pinned, setPinned] = useState(false)
  const pinAt = Math.max(0, headerHeight - barHeight)

  const { selection, setSelection, sortKey, sort } = useListSort('genreTracks')
  const [selecting, setSelecting] = useState(false)
  const { query, items, total, loadMore } = usePagedQuery<Track>({
    queryKey: ['genre-tracks', connection?.id, id, sortKey],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.genreTracks(id, { page, size: 100, sort }),
  })

  // 权威流派详情（名字 + 曲目数）：接口挂了就退回路由参数与列表计数，不让整页打不开
  const detailQuery = useQuery({
    queryKey: ['genre-detail', connection?.id, id],
    enabled: Boolean(provider && id),
    staleTime: 1000 * 60 * 5,
    queryFn: () => provider!.genre(id),
  })

  const displayName = detailQuery.data?.name || name || '流派'
  const trackTotal = detailQuery.data?.trackCount ?? total

  // 播放整张流派
  async function play(startIndex: number, shuffle = false) {
    if (!provider || !connection || items.length === 0) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks: items,
      startIndex,
      source: { kind: 'genre', id, label: `流派 · ${displayName}` },
    })
    if (shuffle) await toggleShuffle()
  }

  // 菜单动作：追加到当前播放队列
  const handleAppendToQueue = async () => {
    if (!provider || !connection || items.length === 0) {
      toast('流派没有歌曲可添加')
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

  // 获取封面：排序切换时保留已有封面，避免唱片中心闪烁
  const [stableCoverId, setStableCoverId] = useState<string | undefined>(initialCoverId)
  const firstTrackCoverId = items[0]?.coverId || initialCoverId || stableCoverId
  if (items[0]?.coverId && items[0].coverId !== stableCoverId) {
    setStableCoverId(items[0].coverId)
  }

  // 播放总时长统计（毫秒）
  const totalDurationMs = useMemo(
    () => items.reduce((acc, track) => acc + (track.durationMs || 0), 0),
    [items],
  )

  const insets = useSafeAreaInsets()
  const topHeaderOffset = Math.max(insets.top, 20) + 44

  const palette = useMemo(
    () => resolveAmbientPalette(id ?? firstTrackCoverId),
    [id, firstTrackCoverId],
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

  if (query.isPending && items.length === 0) return <LoadingState />
  if (query.isLoadingError && items.length === 0) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  const toolbar = (
    <ListToolbar
      kind="genreTracks"
      total={trackTotal}
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
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: 0 }, navBgAnimatedStyle]} pointerEvents="none">
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
              <VinylDisc genreId={id} coverId={firstTrackCoverId} size={28} variant="full" />
              <Text style={styles.navTitleText} numberOfLines={1}>
                {displayName}
              </Text>
            </Animated.View>
          ),
          headerRight: () => (
            <View style={styles.navRightRow}>
              <Animated.View style={navPlayAnimatedStyle}>
                <Pressable
                  hitSlop={8}
                  style={({ pressed }) => [styles.navIconButton, pressed && styles.navIconButtonPressed]}
                  onPress={() => {
                    void play(0)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部"
                >
                  <Icon name="play" size={18} color={colors.textPrimary} filled />
                </Pressable>
              </Animated.View>
              <MenuView
                title={displayName}
                themeVariant={mode === 'dark' ? 'dark' : 'light'}
                shouldOpenOnLongPress={false}
                isAnchoredToRight={true}
                actions={menuActions}
                onPressAction={handleMenuAction}
              >
                <Pressable
                  style={({ pressed }) => [styles.navIconButton, pressed && styles.navIconButtonPressed]}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="流派菜单"
                >
                  <Icon name="more" size={iconSize.xl} color={colors.textPrimary} />
                </Pressable>
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
          { paddingTop: topHeaderOffset + 16, paddingBottom: bottom },
        ]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        ListHeaderComponent={
          <View style={styles.headerRoot} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <View style={styles.coverBlock}>
              <Animated.View style={[styles.coverContainer, coverAnimatedStyle]}>
                <View style={[styles.discShadowWrapper, { shadowColor: palette.primary }]}>
                  <VinylDisc genreId={id} coverId={firstTrackCoverId} size={200} variant="full" />
                </View>
              </Animated.View>

              <Text style={styles.name} numberOfLines={2}>
                {displayName}
              </Text>

              {/* 核心双动作胶囊：同级等权半透微质感磨砂胶囊 */}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部歌曲"
                >
                  <Icon name="play" size={iconSize.sm} color={colors.textPrimary} filled />
                  <Text style={styles.secondaryButtonLabel}>播放全部</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                  onPress={() => void handleAppendToQueue()}
                  accessibilityRole="button"
                  accessibilityLabel="添加到播放队列"
                >
                  <Icon name="add" size={iconSize.sm} color={colors.textPrimary} />
                  <Text style={styles.secondaryButtonLabel}>添加到队列</Text>
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
        ListEmptyComponent={<EmptyState text="这个流派下还没有歌曲" />}
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

      {/* 滚动过头部后吸附顶部的精简工具条 */}
      {pinned && total > 0 ? (
        <DetailPinnedToolbar top={topHeaderOffset}>
          {toolbar}
        </DetailPinnedToolbar>
      ) : null}

      <TrackSelectionModal
        visible={selecting}
        items={items}
        source={{ kind: 'genre', id, label: `流派 · ${displayName}` }}
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
    marginBottom: 0,
  },
  coverBlock: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  coverContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  discShadowWrapper: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.title,
    fontSize: 24,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    lineHeight: 30,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 20,
    width: '100%',
  },
  secondaryButton: {
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
  secondaryButtonLabel: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.medium,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  navIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  navIconButtonPressed: {
    backgroundColor: colors.bgListItemHover,
  },
  toolbarSlot: {
    alignSelf: 'stretch',
    marginTop: 20,
    marginBottom: spacing.xs,
    paddingBottom: spacing.sm,
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
  navTitleText: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  navRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: -spacing.sm,
  },
}))
