import { useMemo, useState } from 'react'
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Link, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import type { Track } from '@qj/core-domain'
import { AmbientHeaderBackground } from '@/components/ambient-header-background'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, PaginationFooter } from '@/components/list-states'
import { TrackListSkeleton } from '@/components/skeleton'
import { SegmentedTabs, type SegmentedTabItem } from '@/components/segmented-tabs'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { TrackRow } from '@/components/track-row'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { useLocalFavoritesStore } from '@/lib/local-favorites'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { appendTracks, playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { resolveAmbientPalette } from '@/theme/ambient-palette'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

type FavoriteTab = 'tracks' | 'albums' | 'playlists'

const TABS: readonly SegmentedTabItem<FavoriteTab>[] = [
  { key: 'tracks', label: '歌曲' },
  { key: 'albums', label: '专辑' },
  { key: 'playlists', label: '歌单' },
]

/**
 * 我喜欢的音乐 (FavoritesScreen):
 * - 纯净三 Tab 架构：歌曲 (服务端) / 专辑 (本地收藏) / 歌单 (本地收藏)；
 * - 紧凑双层毛玻璃吸顶导航与分类切换栏，无需翻页即达；
 * - 核心双主动作胶囊：大号「播放全部」与「随机播放」；
 * - 专辑与歌单采用 2 列卡片网格规范，一键跳转详情。
 */
export function FavoritesScreen() {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const toast = useToast()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const { width } = useWindowDimensions()

  const [activeTab, setActiveTab] = useState<FavoriteTab>('tracks')

  // 本地收藏的专辑与歌单
  const favoriteAlbums = useLocalFavoritesStore((s) => (connection ? s.getFavoriteAlbums(connection.id) : []))
  const favoritePlaylists = useLocalFavoritesStore((s) => (connection ? s.getFavoritePlaylists(connection.id) : []))

  // 网格列宽
  const columns = width >= 700 ? 3 : 2
  const gap = spacing.md
  const gridItemWidth = (width - spacing.lg * 2 - gap * (columns - 1)) / columns

  const { selection, setSelection, sortKey, sort } = useListSort('favorites')
  const [selecting, setSelecting] = useState(false)
  const { query, items, total, loadMore } = usePagedQuery<Track>({
    queryKey: ['favorites', connection?.id, sortKey],
    enabled: Boolean(provider?.favorites),
    fetchPage: (page) => provider!.favorites!({ page, size: 50, sort }),
  })

  // 播放全部歌曲
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

  // 提取首曲封面用于氛围流体底色
  const firstTrackCoverId = items[0]?.coverId ?? items[0]?.album?.coverId

  // 播放总时长统计（毫秒）
  const totalDurationMs = useMemo(
    () => items.reduce((acc, track) => acc + (track.durationMs || 0), 0),
    [items],
  )

  const insets = useSafeAreaInsets()
  const topHeaderOffset = Math.max(insets.top, 20) + 44
  const tabBarHeight = 44
  const contentTopPadding = topHeaderOffset + tabBarHeight + spacing.sm

  const palette = useMemo(
    () => resolveAmbientPalette(firstTrackCoverId ?? 'favorites'),
    [firstTrackCoverId],
  )

  if (provider && !provider.capabilities.favorites) {
    return <EmptyState text="当前服务器不支持收藏" />
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
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <BlurView
                tint={mode === 'dark' ? 'dark' : 'light'}
                intensity={100}
                style={StyleSheet.absoluteFill}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgFloatingBlur, opacity: 0.7 }]} />
              <View style={[styles.navBottomBorder, { backgroundColor: colors.borderSubtle }]} />
            </View>
          ),
          headerTitle: () => (
            <View style={styles.navTitleRow}>
              <View style={styles.navHeartBadge}>
                <Icon name="heart" size={14} color={colors.like} filled />
              </View>
              <Text style={styles.navTitleText} numberOfLines={1}>
                我喜欢的音乐
              </Text>
            </View>
          ),
          headerRight: () => (
            <View style={styles.navRightRow}>
              <MenuView
                title="我喜欢的音乐"
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
                  accessibilityLabel="收藏菜单"
                >
                  <Icon name="more" size={iconSize.xl} color={colors.textPrimary} />
                </Pressable>
              </MenuView>
            </View>
          ),
        }}
      />

      {/* 导航栏下方悬浮固定三 Tab 分类切换器 */}
      <View style={[styles.tabBarContainer, { top: topHeaderOffset }]}>
        <BlurView
          tint={mode === 'dark' ? 'dark' : 'light'}
          intensity={100}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgFloatingBlur, opacity: 0.7 }]} />
        <View style={[styles.navBottomBorder, { backgroundColor: colors.borderSubtle }]} />
        <SegmentedTabs
          items={TABS}
          value={activeTab}
          onChange={setActiveTab}
          center
        />
      </View>

      {/* 顶部柔和流体弥散氛围光底色 */}
      <AmbientHeaderBackground palette={palette} />

      {/* Tab 1: 歌曲列表 */}
      {activeTab === 'tracks' ? (
        query.isPending && items.length === 0 ? (
          <View style={{ paddingTop: contentTopPadding }}>
            <TrackListSkeleton />
          </View>
        ) : query.isLoadingError && items.length === 0 ? (
          <View style={{ paddingTop: contentTopPadding }}>
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.list,
              { paddingTop: contentTopPadding, paddingBottom: bottom },
            ]}
            ListHeaderComponent={
              <View style={styles.tracksHeader}>
                {/* 核心双主动作胶囊：同级等权「播放全部」与「添加到队列」 */}
                <View style={styles.actions}>
                  <Pressable
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                    onPress={() => void play(0)}
                    accessibilityRole="button"
                    accessibilityLabel="播放全部我喜欢的音乐"
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

                <View style={styles.toolbarSlot}>
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
        )
      ) : null}

      {/* Tab 2: 收藏的专辑网格 */}
      {activeTab === 'albums' ? (
        <FlatList
          data={favoriteAlbums}
          key={`albums-${columns}`}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.gridList,
            { paddingTop: contentTopPadding, paddingBottom: bottom },
          ]}
          columnWrapperStyle={{ gap }}
          ListEmptyComponent={
            <EmptyState text="还没有收藏的专辑&#10;在专辑详情页点击右上角爱心即可收藏" />
          }
          renderItem={({ item }) => (
            <Link href={href.album(item.id)} asChild>
              <Pressable
                style={{ width: gridItemWidth, marginBottom: spacing.md }}
                accessibilityRole="button"
                accessibilityLabel={`专辑 ${item.name}`}
              >
                <CoverImage coverId={item.coverId ?? undefined} size={gridItemWidth} borderRadius={radius.album} />
                <Text numberOfLines={1} style={styles.cardName}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={styles.cardSubtitle}>
                  {item.artistName || '未知艺术家'}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      ) : null}

      {/* Tab 3: 收藏的歌单网格 */}
      {activeTab === 'playlists' ? (
        <FlatList
          data={favoritePlaylists}
          key={`playlists-${columns}`}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.gridList,
            { paddingTop: contentTopPadding, paddingBottom: bottom },
          ]}
          columnWrapperStyle={{ gap }}
          ListEmptyComponent={
            <EmptyState text="还没有收藏的歌单&#10;在歌单详情页点击右上角爱心即可收藏" />
          }
          renderItem={({ item }) => (
            <Link href={href.playlist(item.id)} asChild>
              <Pressable
                style={{ width: gridItemWidth, marginBottom: spacing.md }}
                accessibilityRole="button"
                accessibilityLabel={`歌单 ${item.name}`}
              >
                <CoverImage coverId={item.coverId ?? undefined} size={gridItemWidth} borderRadius={radius.album} />
                <Text numberOfLines={1} style={styles.cardName}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={styles.cardSubtitle}>
                  {typeof item.trackCount === 'number' ? `${item.trackCount} 首歌曲` : '歌单'}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      ) : null}

      {/* 批量操作模态弹窗 */}
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
    backgroundColor: colors.bgPrimary,
  },
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
    height: 44,
    justifyContent: 'center',
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  gridList: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  tracksHeader: {
    marginBottom: spacing.xs,
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
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
  navHeartBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleText: {
    ...typography.headline,
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  navRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: -spacing.sm,
  },
  cardName: {
    ...typography.subhead,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  cardSubtitle: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
}))
