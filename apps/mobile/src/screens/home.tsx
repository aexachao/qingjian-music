import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Album, Playlist, Track } from '@qj/core-domain'
import { CollapsibleHeaderBar, LargeTitleHeader } from '@/components/collapsible-tab-header'
import { HomePullRefreshIndicator, useHomePullRefresh } from '@/components/home-pull-refresh'
import { ErrorState } from '@/components/list-states'
import { ScanMonitorButton } from '@/components/scan-monitor-button'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { startNativeRefresh } from '@/lib/home-pull-refresh-policy'
import { tap } from '@/lib/haptics'
import { isGlobalMenuInteracting, useIsMenuOpen } from '@/lib/menu-guard'
import { useServerSession } from '@/lib/server-session'
import { startHomeRadio } from '@/lib/local-radio'
import { playTrackList } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'
import { AlbumShelf } from './home/AlbumShelf'
import { HeroStationCard, HERO_STATION_CARD_HEIGHT } from './home/HeroStationCard'
import { PagedTrackCarousel } from './home/PagedTrackCarousel'
import { PlaylistShelf } from './home/PlaylistShelf'
import { QuickAssetRow } from './home/QuickAssetRow'
import { SectionHeader } from './home/SectionHeader'

const TRACKS_CAROUSEL_SIZE = 9
const RECENT_ALBUMS_COUNT = 12
const EMPTY_TRACKS: Track[] = []

/**
 * 首页：对齐 Apple Music「现在就听」的克制美学。
 * 顶部焦点区：半露唱片与喜欢、下载组成唱片抽屉；
 * 随后展开：最近播放、歌单、最近添加歌曲、最近添加专辑、岁月拾遗。
 */
export function HomeScreen() {
  const { provider, connection } = useServerSession()
  const { fontScale } = useWindowDimensions()
  const bottom = useBottomSpace()
  const toast = useToast()
  const current = usePlayerStore(selectCurrent)
  const source = usePlayerStore((s) => s.source)
  const isRoaming = Boolean(current && source?.kind === 'radio')
  const [startingRadio, setStartingRadio] = useState(false)
  const radioInFlight = useRef(false)
  const isMenuOpen = useIsMenuOpen()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const scrollY = useSharedValue(0)

  const heroTop = useSharedValue(0)

  // 复用播放记录的失效前缀，播放上报后首页与完整历史页一同更新。
  const historyQuery = useQuery({
    queryKey: ['history', connection?.id, 'home'],
    enabled: Boolean(provider?.capabilities.playHistory && provider.history),
    queryFn: () => provider!.history!({ page: 1, size: TRACKS_CAROUSEL_SIZE }),
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

  const historyTracks: Track[] = historyQuery.data?.items ?? EMPTY_TRACKS
  const playlists: Playlist[] = playlistsQuery.data?.items ?? []
  const recentTracks: Track[] = recentTracksQuery.data?.items ?? EMPTY_TRACKS
  const recentAlbums: Album[] = recentAlbumsQuery.data?.items ?? []
  const rediscoverTracks: Track[] = rediscoverTracksQuery.data?.items ?? EMPTY_TRACKS

  // 同时刷新首页内容与历史预览；禁用的查询由 React Query 跳过。
  const [refreshing, setRefreshing] = useState(false)
  const mountedRef = useRef(true)
  const refreshInFlightRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const startRefresh = useCallback(() => {
    if (!mountedRef.current || refreshInFlightRef.current) return false
    refreshInFlightRef.current = true
    setRefreshing(true)
    return Promise.all([
      queryClient.refetchQueries({ queryKey: ['home'] }),
      queryClient.refetchQueries({ queryKey: ['history', connection?.id, 'home'], exact: true }),
    ])
      .catch(() => {})
      .finally(() => {
        refreshInFlightRef.current = false
        if (mountedRef.current) setRefreshing(false)
      })
      .then(() => true)
  }, [queryClient, connection?.id])
  // Android keeps RefreshControl: it owns the trigger threshold, so the feedback
  // belongs to the actual native refresh callback rather than an inferred offset.
  const onAndroidRefresh = useCallback(() => {
    startNativeRefresh(startRefresh, () => {
      tap()
    })
  }, [startRefresh])
  const isIOS = Platform.OS === 'ios'
  const { onScroll, pullDistance, refreshingOnUI } = useHomePullRefresh({
    enabled: isIOS,
    refreshing,
    onRefresh: startRefresh,
    scrollY,
  })

  // 全部启用的查询都失败 = 网络/服务器不可达。此时所有分区都会因空数组而 return null，
  // 页面变成一片空白 —— 用户看不出是「没内容」还是「连不上」，所以必须显式给错误态。
  // 只有「全失败」才拦截：部分失败时其余分区照常展示，比整页错误更有用。
  const homeQueries = [
    historyQuery,
    playlistsQuery,
    recentTracksQuery,
    recentAlbumsQuery,
    rediscoverTracksQuery,
  ]
  const enabledQueries = homeQueries.filter((query) => query.isEnabled)
  const allFailed = enabledQueries.length > 0 && enabledQueries.every((query) => query.isError)
  const firstError = enabledQueries.find((query) => query.isError)?.error

  /** 随心漫游：优先用本地口味画像漫游（更懂你），失败/为空再退回服务端漫游 */
  const onRadio = useCallback(async () => {
    if (isGlobalMenuInteracting()) return
    if (!provider || !connection || radioInFlight.current) return
    radioInFlight.current = true
    setStartingRadio(true)
    try {
      await startHomeRadio(provider, connection.id)
      if (mountedRef.current) toast('漫游已开始，随时切歌')
    } catch (error) {
      if (mountedRef.current) toast(error instanceof Error ? error.message : '漫游启动失败，请稍后再试')
    } finally {
      radioInFlight.current = false
      if (mountedRef.current) setStartingRadio(false)
    }
  }, [connection, provider, toast])

  const onPlayHistoryTrack = useCallback(
    (_track: Track, index: number) => {
      if (isGlobalMenuInteracting() || !provider || !connection) return
      void playTrackList({
        provider,
        serverId: connection.id,
        tracks: historyTracks,
        startIndex: index,
        source: { kind: 'history', label: '最近播放' },
      }).catch((error) => {
        if (mountedRef.current) toast(error instanceof Error ? error.message : '播放失败，请稍后再试')
      })
    },
    [connection, provider, historyTracks, toast],
  )

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
      <CollapsibleHeaderBar title="首页" scrollY={scrollY} rightElement={<ScanMonitorButton />} />
      {allFailed ? (
        // 连不上服务器时整页给错误态：比「一堆空分区」更明确，且带重试入口
        <ErrorState error={firstError} onRetry={startRefresh} />
      ) : (
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
        alwaysBounceVertical
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={!isIOS ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onAndroidRefresh}
            progressViewOffset={Math.max(insets.top, 20) + 44}
            tintColor={colors.loadingIndicator}
            colors={[colors.loadingIndicator]}
            progressBackgroundColor={colors.bgPrimary}
          />
        ) : undefined}
      >
        <LargeTitleHeader title="首页" scrollY={scrollY} />
        <View style={styles.sections} onLayout={(event) => { heroTop.value = event.nativeEvent.layout.y }}>
          {/* 唱片抽屉：左侧漫游，右侧喜欢与下载。 */}
          <View style={[styles.heroGroup, { minHeight: HERO_STATION_CARD_HEIGHT * Math.max(1, fontScale) }]}>
            <HeroStationCard
              onStartRadio={onRadio}
              isRoaming={isRoaming}
              startingRadio={startingRadio}
              disabled={!isRoaming && !provider}
              scrollY={scrollY}
              contentTop={heroTop}
              isInteracting={isGlobalMenuInteracting}
            />

            <QuickAssetRow
              isInteracting={isGlobalMenuInteracting}
            />
          </View>

          {historyQuery.isEnabled ? (
            historyTracks.length > 0 ? (
              <PagedTrackCarousel
                title="最近播放"
                tracks={historyTracks}
                seeAllHref="/home/history"
                currentTrackId={current?.trackId}
                currentServerId={current?.serverId}
                serverId={connection?.id}
                onPlayTrack={onPlayHistoryTrack}
              />
            ) : (
              <View style={styles.emptyHistory}>
                <SectionHeader title="最近播放" href="/home/history" isInteracting={isGlobalMenuInteracting} />
                <Text style={[typography.footnote, { color: colors.textSecondary }]}>
                  {historyQuery.isPending ? '正在加载播放记录…' : historyQuery.isError ? '播放记录暂时无法加载，下拉重试' : '听过的歌曲会显示在这里'}
                </Text>
              </View>
            )
          ) : null}

          {playlists.length > 0 ? (
            <PlaylistShelf playlists={playlists} isInteracting={isGlobalMenuInteracting} />
          ) : null}

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
      {isIOS ? (
        <HomePullRefreshIndicator
          pullDistance={pullDistance}
          refreshing={refreshing}
          refreshingOnUI={refreshingOnUI}
          top={Math.max(insets.top, 20) + 44 + 8}
        />
      ) : null}

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
  // 让迷你播放器与页签之间的 4pt 停靠缝隙露出页面底色，而不是截断的滚动文字。
  scroll: { marginBottom: spacing.xs },
  content: {
    paddingHorizontal: spacing.pageMargin,
    paddingTop: 0,
  },
  sections: {
    gap: spacing.sectionGap,
    marginTop: spacing.sm,
  },
  heroGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  emptyHistory: { gap: spacing.sm },
})
