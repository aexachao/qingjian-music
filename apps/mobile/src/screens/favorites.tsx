import { useMemo, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import type { Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { TrackRow } from '@/components/track-row'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { formatPlaylistDuration } from '@/lib/playlist-meta'
import { appendTracks, playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
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

  // 播放总时长统计
  const totalDurationMs = useMemo(
    () => items.reduce((acc, track) => acc + (track.durationMs || 0), 0),
    [items],
  )
  const formattedDuration = formatPlaylistDuration(totalDurationMs)

  if (provider && !provider.capabilities.favorites) {
    return <EmptyState text="当前服务器不支持收藏" />
  }

  if (query.isPending && items.length === 0) return <LoadingState />
  if (query.isLoadingError && items.length === 0) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const toolbar = (
    <ListToolbar
      kind="favorites"
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
          title: pinned ? '我喜欢的音乐' : '',
          headerLeft: () => <StackBackButton />,
          headerRight: () => (
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
              {/* 大封面封套与红心艺术标识 */}
              <View style={styles.coverShadowWrapper}>
                {firstTrackCoverId ? (
                  <View style={styles.coverRelative}>
                    <CoverImage coverId={firstTrackCoverId} size={210} borderRadius={radius.album} />
                    <View style={styles.heartFloatBadge}>
                      <Icon name="heart" size={24} color={colors.primaryAction} filled />
                    </View>
                  </View>
                ) : (
                  <View style={styles.heroHeartCard}>
                    <Icon name="heart" size={72} color={colors.primaryAction} filled />
                  </View>
                )}
              </View>

              {/* 收藏属性角标 */}
              <View style={styles.badgeWrapper}>
                <Text style={styles.badgeText}>精选收藏</Text>
              </View>

              <Text style={styles.name} numberOfLines={1}>
                我喜欢的音乐
              </Text>

              {/* 歌曲数与总时长统计 */}
              <Text style={styles.meta}>
                {total} 首歌曲
                {formattedDuration ? ` · ${formattedDuration}` : ''}
              </Text>

              {/* 核心动作：大号播放与随机播放双胶囊 */}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放我喜欢的音乐"
                >
                  <Icon name="play" size={iconSize.sm} color={colors.textOnAccent} filled />
                  <Text style={styles.playButtonLabel}>播放</Text>
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

      {pinned && total > 0 ? <View style={styles.pinnedBar}>{toolbar}</View> : null}

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
  coverShadowWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: spacing.xs,
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
    shadowColor: '#000',
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
  name: {
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
