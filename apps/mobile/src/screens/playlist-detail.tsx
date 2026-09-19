import { useMemo, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import type { Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { useConfirm } from '@/components/confirm-modal'
import { usePrompt } from '@/components/prompt-modal'
import { useToast } from '@/components/toast'
import { StackBackButton } from '@/components/stack-back-button'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, PaginationFooter } from '@/components/list-states'
import { TrackListSkeleton } from '@/components/skeleton'
import { TrackRow } from '@/components/track-row'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { useBottomSpace } from '@/lib/bottom-space'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { formatPlaylistDuration, resolvePlaylistCover } from '@/lib/playlist-meta'
import { appendTracks, playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
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

  // 播放总时长统计
  const totalDurationMs = useMemo(
    () => items.reduce((acc, track) => acc + (track.durationMs || 0), 0),
    [items],
  )
  const formattedDuration = formatPlaylistDuration(totalDurationMs)

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
        image: Platform.OS === 'ios' ? 'text.badge.plus' : undefined,
      },
    ]
    if (canWrite) {
      actions.push({
        id: 'rename-playlist',
        title: '重命名歌单',
        image: Platform.OS === 'ios' ? 'pencil' : undefined,
      })
      actions.push({
        id: 'delete-playlist',
        title: '删除歌单',
        image: Platform.OS === 'ios' ? 'trash' : undefined,
        attributes: { destructive: true },
      })
    }
    return actions
  }, [canWrite])

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

  if (query.isPending && items.length === 0) return <TrackListSkeleton />
  if (query.isLoadingError && items.length === 0) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const toolbar = (
    <ListToolbar
      kind="playlistTracks"
      total={total}
      selection={selection}
      onSelect={setSelection}
      onStartSelection={() => setSelecting(true)}
    />
  )

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: pinned ? displayName : '',
          headerLeft: () => <StackBackButton />,
          headerRight: () => (
            <MenuView
              title={displayName}
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
                accessibilityLabel="歌单菜单"
              >
                <Icon name="more" size={iconSize.md} color={colors.textPrimary} />
              </View>
            </MenuView>
          ),
        }}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y
          const next = pinAt > 0 && y >= pinAt
          setPinned((previous) => (previous === next ? previous : next))
        }}
        ListHeaderComponent={
          <View style={styles.headerRoot} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <View style={styles.coverBlock}>
              {/* 大封面封套与景深阴影 */}
              <View style={styles.coverShadowWrapper}>
                <CoverImage coverId={resolvedCoverId} size={210} borderRadius={radius.album} />
              </View>

              {/* 歌单属性标识 */}
              <View style={styles.badgeWrapper}>
                <Text style={styles.badgeText}>歌单</Text>
              </View>

              {/* 歌单标题 */}
              <Text style={styles.title} numberOfLines={2}>
                {displayName}
              </Text>

              {/* 元数据：歌曲数量与总时长 */}
              <Text style={styles.meta}>
                {total} 首歌曲
                {formattedDuration ? ` · ${formattedDuration}` : ''}
              </Text>

              {/* 歌单介绍（若有） */}
              {playlist?.description ? (
                <Text style={styles.description} numberOfLines={3}>
                  {playlist.description}
                </Text>
              ) : null}

              {/* 核心动作：大号播放与随机播放双胶囊 */}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放歌单全部歌曲"
                >
                  <Icon name="play" size={iconSize.sm} color={colors.textOnAccent} filled />
                  <Text style={styles.playButtonLabel}>播放</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.shuffleButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0, true)}
                  accessibilityRole="button"
                  accessibilityLabel="随机播放歌单"
                >
                  <Icon name="shuffle" size={iconSize.sm} color={colors.textPrimary} />
                  <Text style={styles.shuffleButtonLabel}>随机播放</Text>
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
      {pinned && total > 0 ? <View style={styles.pinnedBar}>{toolbar}</View> : null}

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
    marginBottom: spacing.sm,
  },
  coverBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  coverShadowWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: spacing.xs,
  },
  badgeWrapper: {
    backgroundColor: colors.bgButtonSecondary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.xs,
    marginTop: spacing.xs,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  meta: {
    ...typography.footnote,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  description: {
    ...typography.footnote,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: 2,
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
    backgroundColor: colors.primaryAction,
  },
  playButtonLabel: {
    ...typography.headline,
    fontFamily: fonts.semibold,
    color: colors.textOnAccent,
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
    top: 0,
    left: 0,
    right: 0,
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
}))
