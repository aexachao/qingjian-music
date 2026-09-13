import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Album, Playlist, Track } from '@qj/core-domain'
import { CollapsibleHeaderBar, LargeTitleHeader } from '@/components/collapsible-tab-header'
import { ErrorState } from '@/components/list-states'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { isGlobalMenuInteracting, useIsMenuOpen } from '@/lib/menu-guard'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, startRadio } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { useThemeColors } from '@/theme/theme-provider'
import { spacing } from '@/theme/tokens'
import { AlbumShelf } from './home/AlbumShelf'
import { HeroStationCard } from './home/HeroStationCard'
import { PagedTrackCarousel } from './home/PagedTrackCarousel'
import { PlaylistShelf } from './home/PlaylistShelf'
import { QuickAssetRow } from './home/QuickAssetRow'

const TRACKS_CAROUSEL_SIZE = 9
const RECENT_ALBUMS_COUNT = 12

/**
 * 首页：对齐 Apple Music「现在就听」的克制美学。
 * 顶部焦点区：随心漫游卡片与三等分瓷片紧凑组合（间距 12pt）；
 * 随后展开：歌单、最近添加歌曲、最近添加专辑、岁月拾遗。
 */
export function HomeScreen() {
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()
  const toast = useToast()
  const current = usePlayerStore(selectCurrent)
  const [startingRadio, setStartingRadio] = useState(false)
  const isMenuOpen = useIsMenuOpen()
  const colors = useThemeColors()
  const queryClient = useQueryClient()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  // 1. 曲目总数（随心漫游卡片上的曲库规模感知）
  const totalTracksQuery = useQuery({
    queryKey: ['home', 'total-tracks-count', connection?.id],
    enabled: Boolean(provider),
    queryFn: () => provider!.tracks({ page: 1, size: 1 }),
  })

  // 2. 收藏总数（功能卡片区）
  const favoritesQuery = useQuery({
    queryKey: ['home', 'favorites-count', connection?.id],
    enabled: Boolean(provider?.capabilities.favorites),
    queryFn: () => provider!.favorites!({ page: 1, size: 1 }),
  })

  // 3. 歌单（有则展示，无则隐藏）
  const playlistsQuery = useQuery({
    queryKey: ['home', 'playlists', connection?.id],
    enabled: Boolean(provider && provider.capabilities.playlists !== 'none'),
    queryFn: () => provider!.playlists({ page: 1, size: 8 }),
  })

  // 4. 最近添加歌曲（9首，用于 3首/屏 × 3屏 轮播）
  const recentTracksQuery = useQuery({
    queryKey: ['home', 'recent-tracks', connection?.id],
    enabled: Boolean(provider),
    queryFn: () =>
      provider!.tracks({
        page: 1,
        size: TRACKS_CAROUSEL_SIZE,
        sort: { field: 'createdAt', order: 'desc' },
      }),
  })

  // 5. 最近添加专辑（12张）
  const recentAlbumsQuery = useQuery({
    queryKey: ['home', 'recent-albums', connection?.id],
    enabled: Boolean(provider),
    queryFn: () =>
      provider!.albums({
        page: 1,
        size: RECENT_ALBUMS_COUNT,
        sort: { field: 'createdAt', order: 'desc' },
      }),
  })

  // 6. 岁月拾遗：抽选 NAS 中入库较早或经典沉睡的单曲（9首）
  const rediscoverTracksQuery = useQuery({
    queryKey: ['home', 'rediscover-tracks', connection?.id],
    enabled: Boolean(provider),
    queryFn: () =>
      provider!.tracks({
        page: 1,
        size: TRACKS_CAROUSEL_SIZE,
        sort: { field: 'createdAt', order: 'asc' },
      }),
  })

  const playlists: Playlist[] = playlistsQuery.data?.items ?? []
  const recentTracks: Track[] = recentTracksQuery.data?.items ?? []
  const recentAlbums: Album[] = recentAlbumsQuery.data?.items ?? []
  const rediscoverTracks: Track[] = rediscoverTracksQuery.data?.items ?? []

  // 首页 6 个查询共用一个 'home' 前缀，下拉刷新一次性刷全部。
  // refetchQueries 内部会跳过 disabled 的查询（如后端不支持收藏时的 favorites），
  // 所以不需要在这里逐个判断 enabled。
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await queryClient.refetchQueries({ queryKey: ['home'] })
    } finally {
      setRefreshing(false)
    }
  }, [queryClient])

  // 全部启用的查询都失败 = 网络/服务器不可达。此时所有分区都会因空数组而 return null，
  // 页面变成一片空白 —— 用户看不出是「没内容」还是「连不上」，所以必须显式给错误态。
  // 只有「全失败」才拦截：部分失败时其余分区照常展示，比整页错误更有用。
  const homeQueries = [
    totalTracksQuery,
    favoritesQuery,
    playlistsQuery,
    recentTracksQuery,
    recentAlbumsQuery,
    rediscoverTracksQuery,
  ]
  const enabledQueries = homeQueries.filter((query) => query.isEnabled)
  const allFailed = enabledQueries.length > 0 && enabledQueries.every((query) => query.isError)
  const firstError = enabledQueries.find((query) => query.isError)?.error

  /** 随心漫游：一键随机漫步全库无限流 */
  const onRadio = useCallback(async () => {
    if (isGlobalMenuInteracting()) return
    if (!provider || !connection || startingRadio) return
    setStartingRadio(true)
    try {
      await startRadio(provider, connection.id)
      toast('漫游已开始，随时切歌')
    } catch {
      toast('漫游启动失败，请稍后再试')
    } finally {
      setStartingRadio(false)
    }
  }, [connection, provider, startingRadio, toast])

  /** 播放「最近添加歌曲」队列 */
  const onPlayRecentTrack = useCallback(
    (_track: Track, index: number) => {
      if (isGlobalMenuInteracting()) return
      if (!provider || !connection) return
      void playTrackList({
        provider,
        serverId: connection.id,
        tracks: recentTracks,
        startIndex: index,
        source: { kind: 'tracks', label: '最近添加歌曲' },
      })
    },
    [connection, provider, recentTracks],
  )

  /** 播放「岁月拾遗」队列 */
  const onPlayRediscoverTrack = useCallback(
    (_track: Track, index: number) => {
      if (isGlobalMenuInteracting()) return
      if (!provider || !connection) return
      void playTrackList({
        provider,
        serverId: connection.id,
        tracks: rediscoverTracks,
        startIndex: index,
        source: { kind: 'tracks', label: '岁月拾遗' },
      })
    },
    [connection, provider, rediscoverTracks],
  )

  return (
    <View style={styles.root}>
      <CollapsibleHeaderBar title="首页" scrollY={scrollY} />
      {allFailed ? (
        // 连不上服务器时整页给错误态：比「一堆空分区」更明确，且带重试入口
        <ErrorState error={firstError} onRetry={() => void onRefresh()} />
      ) : (
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <LargeTitleHeader title="首页" scrollY={scrollY} />
        <View style={styles.sections}>
          {/* 顶部焦点区域：随心漫游与三个快捷瓷片紧密组合（间距 12pt） */}
          <View style={styles.heroGroup}>
            <HeroStationCard
              onStartRadio={onRadio}
              startingRadio={startingRadio}
              totalTracks={totalTracksQuery.data?.total}
              isInteracting={isGlobalMenuInteracting}
            />

            <QuickAssetRow
              favoritesCount={favoritesQuery.data?.total}
              isInteracting={isGlobalMenuInteracting}
            />
          </View>

          {/* 3. 歌单（如果有就展示，如果没有歌单就隐藏） */}
          {playlists.length > 0 ? (
            <PlaylistShelf playlists={playlists} isInteracting={isGlobalMenuInteracting} />
          ) : null}

          {/* 4. 最近添加歌曲（3首/屏 × 3屏 横滑单曲轮播） */}
          <PagedTrackCarousel
            title="最近添加歌曲"
            tracks={recentTracks}
            seeAllHref="/home/recent-tracks"
            currentTrackId={current?.trackId}
            currentServerId={current?.serverId}
            serverId={connection?.id}
            onPlayTrack={onPlayRecentTrack}
          />

          {/* 5. 最近添加专辑（140pt 纯净大唱片横滑架） */}
          <AlbumShelf
            title="最近添加专辑"
            albums={recentAlbums}
            seeAllHref="/home/albums"
            isInteracting={isGlobalMenuInteracting}
          />

          {/* 6. 岁月拾遗（3首/屏 × 3屏 经典单曲轮播） */}
          <PagedTrackCarousel
            title="岁月拾遗"
            tracks={rediscoverTracks}
            seeAllHref="/home/tracks"
            currentTrackId={current?.trackId}
            currentServerId={current?.serverId}
            serverId={connection?.id}
            onPlayTrack={onPlayRediscoverTrack}
          />
        </View>
      </Animated.ScrollView>
      )}

      {/* 快捷菜单打开时的全屏透明拦截遮罩：点击只用于退出菜单，绝不触发底层任何操作 */}
      {isMenuOpen ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            // 消费点击，完全阻断
          }}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.pageMargin,
    paddingTop: 0,
  },
  sections: {
    gap: spacing.sectionGap,
    marginTop: spacing.sm,
  },
  heroGroup: {
    gap: 12,
  },
})
