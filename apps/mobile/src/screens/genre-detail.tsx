import { useMemo, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import type { Track } from '@qj/core-domain'
import { Icon, iconSize } from '@/components/icon'
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
                accessibilityLabel="流派菜单"
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
              <View style={styles.discShadowWrapper}>
                <VinylDisc genreId={id} coverId={firstTrackCoverId} size={200} variant="full" />
              </View>

              <Text style={styles.name} numberOfLines={2}>
                {displayName}
              </Text>

              {/* 核心动作：大号播放与随机播放双胶囊 */}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部歌曲"
                >
                  <Icon name="play" size={iconSize.sm} color={colors.ctaPrimaryText} filled />
                  <Text style={styles.playButtonLabel}>播放全部</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.shuffleButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0, true)}
                  accessibilityRole="button"
                  accessibilityLabel="随机播放"
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

      {pinned && total > 0 ? <View style={styles.pinnedBar}>{toolbar}</View> : null}

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
    marginBottom: spacing.sm,
  },
  coverBlock: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  discShadowWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.title,
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
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
    marginTop: spacing.xl + spacing.sm,
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
