import { useMemo, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
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
import { useDetailHref } from '@/lib/detail-href'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { formatAlbumYear, getAlbumAudioSpecBadge } from '@/lib/album-meta'
import { formatPlaylistDuration } from '@/lib/playlist-meta'
import { appendTracks, playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

/**
 * 专辑详情页 (AlbumDetailScreen):
 * - 切除机械重复封面：列表全面回归经典的音轨编号（leading="index"，01, 02...）；
 * - 专属巨幕大画卷：210pt 封套封面、立体弥散软阴影；
 * - 发烧级音频规格：智能提取全专音质（Hi-Res / 无损音质）与发行年份；
 * - 音乐人直通闭环：艺术家名称支持一键跳转对应的艺人详情页；
 * - 核心双主动作胶囊：大号「播放全部」与「随机播放」；
 * - 原生操作菜单：一键入队与跳转艺术家；
 * - 滚动吸顶联动：越过巨幕后标题平滑折叠，吸顶工具栏支持一键批量多选。
 */
export function AlbumDetailScreen() {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
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
  const formattedDuration = formatPlaylistDuration(totalDurationMs)

  const isMenuOpen = useIsMenuOpen()

  if (albumQuery.isPending) return <LoadingState />
  if (albumQuery.isLoadingError) return <ErrorState error={albumQuery.error} onRetry={() => void albumQuery.refetch()} />
  if (!album) return <EmptyState text="专辑不存在" />

  const toolbar = (
    <ListToolbar
      kind="albumTracks"
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
          title: pinned ? album.name : '',
          headerLeft: () => <StackBackButton />,
          headerRight: () => (
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
                <CoverImage coverId={album.coverId} size={210} borderRadius={radius.album} />
              </View>

              {/* 专辑标题 */}
              <Text style={styles.name} numberOfLines={2}>
                {album.name}
              </Text>

              {/* 艺术家名称（支持点击无缝跳转） */}
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
                  <Icon name="chevronRight" size={14} color={colors.primaryAction} />
                </Pressable>
              ) : (
                <Text style={styles.artistText} numberOfLines={1}>
                  {artistText}
                </Text>
              )}

              {/* 精炼元数据：年份 · 规格徽章（无多余“专辑”标签与长串歌曲数） */}
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

              {/* 核心动作：大号播放与随机播放双胶囊 */}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.playButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放专辑全部歌曲"
                >
                  <Icon name="play" size={iconSize.sm} color={colors.textOnAccent} filled />
                  <Text style={styles.playButtonLabel}>播放</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.shuffleButton, pressed && styles.buttonPressed]}
                  onPress={() => void play(0, true)}
                  accessibilityRole="button"
                  accessibilityLabel="随机播放专辑"
                >
                  <Icon name="shuffle" size={iconSize.sm} color={colors.textPrimary} />
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
          <View style={styles.footerContainer}>
            <PaginationFooter
              loading={query.isFetchingNextPage}
              error={query.isFetchNextPageError ? query.error : undefined}
              onRetry={() => void query.fetchNextPage()}
            />
            {total > 0 && !query.isFetchingNextPage ? (
              <View style={styles.footerSummary}>
                <Text style={styles.footerSummaryText}>
                  {total} 首歌曲{formattedDuration ? `，${formattedDuration}` : ''}
                </Text>
                {album.releaseDate ? (
                  <Text style={styles.footerReleaseDate}>
                    发行时间：{album.releaseDate.slice(0, 10)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        }
      />

      {/* 滚动过头部后吸附顶部的精简工具条 */}
      {pinned && total > 0 ? <View style={styles.pinnedBar}>{toolbar}</View> : null}

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
  name: {
    ...typography.title,
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  artistLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  artistLinkPressed: {
    opacity: 0.7,
  },
  artistText: {
    ...typography.subhead,
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.primaryAction,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaText: {
    ...typography.footnote,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  metaDot: {
    ...typography.footnote,
    color: colors.textTertiary,
  },
  specBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.badgeBorder,
    backgroundColor: colors.badgeBg,
    marginLeft: 2,
  },
  specBadgeText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brandTint,
    letterSpacing: 0.4,
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
    marginLeft: 48,
    backgroundColor: colors.borderSubtle,
  },
  footerContainer: {
    paddingTop: spacing.xs,
  },
  footerSummary: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  footerSummaryText: {
    ...typography.subhead,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  footerReleaseDate: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
  },
}))
