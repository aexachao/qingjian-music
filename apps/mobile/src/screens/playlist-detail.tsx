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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import type { Track } from '@qj/core-domain'
import { AmbientHeaderBackground } from '@/components/ambient-header-background'
import { CoverImage } from '@/components/cover-image'
import { DetailPinnedToolbar } from '@/components/detail-pinned-toolbar'
import { Icon, iconSize } from '@/components/icon'
import { useConfirm } from '@/components/confirm-modal'
import { usePrompt } from '@/components/prompt-modal'
import { useToast } from '@/components/toast'
import { StackBackButton } from '@/components/stack-back-button'
import { stackHeaderIconStyle } from '@/components/stack-header-icon-style'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, PaginationFooter } from '@/components/list-states'
import { TrackListSkeleton } from '@/components/skeleton'
import { TrackRow } from '@/components/track-row'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { useBottomSpace } from '@/lib/bottom-space'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { useLocalFavoritesStore } from '@/lib/local-favorites'
import { tap } from '@/lib/haptics'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { resolvePlaylistCover } from '@/lib/playlist-meta'
import { appendTracks, playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { resolveAmbientPalette } from '@/theme/ambient-palette'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

/**
 * 歌单详情页 (PlaylistDetailScreen):
 * - 专属巨幕大画卷：210pt 封套封面、多级智能回退（歌单封面 -> 首曲封面 -> 品牌占位）；
 * - 完备的元数据展示：歌单标题、曲目数、总播放时长及描述信息；
 * - 核心双主动作胶囊：大号「播放全部」与「随机播放」；
 * - 规范的原生菜单 (MenuView)：提供添加到播放队列、重命名歌单及带二次确认的删除保护；
 * - 滚动吸顶联动：越过巨幕后标题平滑折叠，吸顶工具栏支持一键批量多选。
 */
export function PlaylistDetailScreen() {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
  const { id, name, coverId: initialCoverId } = useLocalSearchParams<{ id: string; name?: string; coverId?: string }>()
  const { provider, connection } = useServerSession()
  const router = useRouter()
  const prompt = usePrompt()
  const confirm = useConfirm()
  const toast = useToast()
  const queryClient = useQueryClient()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()
  const canWrite = provider?.capabilities.playlists === 'write'

  // 吸顶折叠高度计算
  const [headerHeight, setHeaderHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  const [pinned, setPinned] = useState(false)
  const pinAt = Math.max(0, headerHeight - barHeight)

  // 歌单元数据查询（支持获取描述、独立封面等）
  const playlistQuery = useQuery({
    queryKey: ['playlists', connection?.id],
    enabled: Boolean(provider && id),
    queryFn: () => provider!.playlists({ page: 1, size: 100 }),
    staleTime: 60_000,
  })

  const playlist = playlistQuery.data?.items.find((p) => p.id === id)
  const displayName = playlist?.name || name || '歌单'

  // 曲目分页与排序
  const { selection, setSelection } = useListSort('playlistTracks')
  const [selecting, setSelecting] = useState(false)
  const { query, items, total, loadMore } = usePagedQuery<Track>({
    queryKey: ['playlist-tracks', connection?.id, id],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.playlistTracks(id, { page, size: 50 }),
  })

  // 智能封面回退
  const firstTrackCoverId = items[0]?.coverId ?? items[0]?.album?.coverId
  const resolvedCoverId = resolvePlaylistCover({
    playlistCoverId: playlist?.coverId,
    initialCoverId,
    firstTrackCoverId,
  })

  // 播放总时长统计（毫秒）
  const totalDurationMs = useMemo(
    () => items.reduce((acc, track) => acc + (track.durationMs || 0), 0),
    [items],
  )

  const insets = useSafeAreaInsets()
  const topHeaderOffset = Math.max(insets.top, 20) + 44

  const palette = useMemo(
    () => resolveAmbientPalette(id ?? resolvedCoverId),
    [id, resolvedCoverId],
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

  const ambientBackgroundAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value }],
  }))

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

  // 播放整张歌单
  async function play(startIndex: number, shuffle = false) {
    if (!provider || !connection || items.length === 0) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks: items,
      startIndex,
      source: { kind: 'playlist', id, label: `歌单 · ${displayName}` },
    })
    if (shuffle) await toggleShuffle()
  }

  // 菜单动作：添加到队列
  const handleAppendToQueue = async () => {
    if (!provider || !connection || items.length === 0) {
      toast('歌单没有歌曲可添加')
      return
    }
    try {
      await appendTracks({ provider, serverId: connection.id, tracks: items })
      toast(`已添加 ${items.length} 首歌曲到队列`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败')
    }
  }

  // 菜单动作：重命名歌单
  const handleRename = () => {
    prompt({
      title: '重命名歌单',
      placeholder: '歌单名称',
      defaultValue: displayName,
      confirmText: '保存',
      cancelText: '取消',
      maxLength: 32,
      validate: (value) => {
        if (!value.trim()) return '歌单名称不能为空'
        if (value.trim().length > 32) return '名称不能超过 32 个字符'
        return undefined
      },
      onConfirm: async (newName) => {
        try {
          await provider!.editPlaylist!(id, { name: newName })
          toast('已保存')
          await queryClient.invalidateQueries({ queryKey: ['playlists', connection?.id] })
          await queryClient.invalidateQueries({ queryKey: ['playlist-tracks', connection?.id, id] })
        } catch (e) {
          toast(e instanceof Error ? e.message : '保存失败')
        }
      },
    })
  }

  // 菜单动作：删除歌单（安全二次确认）
  const handleDelete = () => {
    confirm({
      title: '删除歌单',
      message: `确定要删除歌单「${displayName}」吗？\n歌单内的歌曲不会被删除。`,
      confirmText: '删除',
      cancelText: '取消',
      destructive: true,
      onConfirm: async () => {
        try {
          await provider!.deletePlaylist!(id)
          toast('歌单已删除')
          await queryClient.invalidateQueries({ queryKey: ['playlists', connection?.id] })
          router.back()
        } catch (e) {
          toast(e instanceof Error ? e.message : '删除失败')
        }
      },
    })
  }

  const menuActions: MenuAction[] = useMemo(() => {
    const actions: MenuAction[] = [
      {
        id: 'append-to-queue',
        title: '添加到当前播放队列',
        image: Platform.OS === 'ios' ? 'text.append' : undefined,
        imageColor: colors.iconBright,
      },
    ]
    if (canWrite) {
      actions.push({
        id: 'rename-playlist',
        title: '重命名歌单',
        image: Platform.OS === 'ios' ? 'pencil' : undefined,
        imageColor: colors.iconBright,
      })
      actions.push({
        id: 'delete-playlist',
        title: '删除歌单',
        image: Platform.OS === 'ios' ? 'trash' : undefined,
        imageColor: colors.iconBright,
        attributes: { destructive: true },
      })
    }
    return actions
  }, [canWrite, colors.iconBright])

  const handleMenuAction = ({ nativeEvent }: NativeActionEvent) => {
    switch (nativeEvent.event) {
      case 'append-to-queue':
        void handleAppendToQueue()
        break
      case 'rename-playlist':
        handleRename()
        break
      case 'delete-playlist':
        handleDelete()
        break
    }
  }

  const isMenuOpen = useIsMenuOpen()

  const isFavorited = useLocalFavoritesStore((s) => (connection ? s.isPlaylistFavorited(connection.id, id) : false))
  const togglePlaylistFavorite = useLocalFavoritesStore((s) => s.togglePlaylist)

  const handleToggleFavorite = () => {
    if (!connection) return
    tap()
    const added = togglePlaylistFavorite(connection.id, {
      id,
      name: displayName,
      coverId: resolvedCoverId,
      trackCount: total,
    })
    toast(added ? '已收藏歌单' : '已取消收藏')
  }

  if (query.isPending && items.length === 0) return <TrackListSkeleton />
  if (query.isLoadingError && items.length === 0) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const toolbar = (
    <ListToolbar
      kind="playlistTracks"
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
              <CoverImage coverId={resolvedCoverId} size={28} borderRadius={4} />
              <Text style={styles.navTitleText} numberOfLines={1}>
                {displayName}
              </Text>
            </Animated.View>
          ),
          headerRight: () => (
            <View style={styles.navRightRow}>
              {pinned ? (
                <Pressable
                  hitSlop={12}
                  style={({ pressed }) => stackHeaderIconStyle(pressed, colors.bgListItemHover)}
                  onPress={() => {
                    void play(0)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部"
                >
                  <Icon name="play" size={18} color={colors.textPrimary} filled />
                </Pressable>
              ) : null}
              <MenuView
                title={displayName}
                themeVariant={mode === 'dark' ? 'dark' : 'light'}
                shouldOpenOnLongPress={false}
                isAnchoredToRight={true}
                actions={menuActions}
                onPressAction={handleMenuAction}
              >
                <Pressable
                  hitSlop={12}
                  style={({ pressed }) => stackHeaderIconStyle(pressed, colors.bgListItemHover)}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="歌单菜单"
                >
                  <Icon name="more" size={iconSize.xl} color={colors.textPrimary} />
                </Pressable>
              </MenuView>
            </View>
          ),
        }}
      />

      {/* 氛围背景从屏幕顶端开始，并与可滚动头部保持相同滚动位移。 */}
      <Animated.View style={[StyleSheet.absoluteFill, ambientBackgroundAnimatedStyle]} pointerEvents="none">
        <AmbientHeaderBackground palette={palette} coverId={playlist?.coverId} />
      </Animated.View>

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
              {/* 大封面封套与景深阴影 */}
              <Animated.View style={[styles.coverContainer, coverAnimatedStyle]}>
                <View style={[styles.coverShadowWrapper, { shadowColor: palette.primary }]}>
                  <CoverImage coverId={resolvedCoverId} size={210} borderRadius={radius.album} />
                </View>
              </Animated.View>

              {/* 歌单标题 */}
              <Text style={styles.title} numberOfLines={2}>
                {displayName}
              </Text>

              {/* 歌单介绍（若有） */}
              {playlist?.description ? (
                <Text style={styles.description} numberOfLines={3}>
                  {playlist.description}
                </Text>
              ) : null}

              {/* 核心双动作胶囊：icon + label 全宽双胶囊 */}
              <View style={styles.actions}>
                <Pressable
                  hitSlop={8}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部"
                >
                  <Icon name="play" size={16} color={colors.textPrimary} filled />
                  <Text style={styles.actionButtonLabel}>播放全部</Text>
                </Pressable>

                <Pressable
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.actionButton,
                    isFavorited && styles.actionButtonActive,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleToggleFavorite}
                  accessibilityRole="button"
                  accessibilityLabel={isFavorited ? '取消喜欢' : '喜欢'}
                >
                  <Icon
                    name="heart"
                    size={16}
                    color={isFavorited ? colors.like : colors.textPrimary}
                    filled={isFavorited}
                  />
                  <Text style={[styles.actionButtonLabel, isFavorited && { color: colors.like }]}>
                    {isFavorited ? '取消喜欢' : '喜欢'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 列表头部工具栏 */}
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
        ListEmptyComponent={<EmptyState text="这个歌单还没有歌曲" />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
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

      {/* 批量操作模态弹窗 */}
      <TrackSelectionModal
        visible={selecting}
        items={items}
        source={{ kind: 'playlist', id, label: `歌单 · ${displayName}` }}
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
  title: {
    ...typography.title,
    fontSize: 24,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: spacing.lg,
    lineHeight: 30,
  },
  description: {
    ...typography.footnote,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginTop: 18,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.detailActionSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
  },
  actionButtonActive: {
    borderColor: colors.borderEmphasis,
  },
  actionButtonLabel: {
    ...typography.subhead,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.medium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
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
  },
}))
