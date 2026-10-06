import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { DetailPinnedToolbar } from '@/components/detail-pinned-toolbar'
import { DetailActionCapsules } from '@/components/detail-action-capsule'
import { IconButton, iconSize } from '@/components/icon'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { SegmentedTabs } from '@/components/segmented-tabs'
import { StackBackButton } from '@/components/stack-back-button'
import { TabPager } from '@/components/tab-pager'
import { TrackRow } from '@/components/track-row'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { tap } from '@/lib/haptics'
import { useLocalFavoritesStore } from '@/lib/local-favorites'
import { computeArtistCompleteness } from '@qj/core-domain'
import { fetchCanonicalArtistAlbumPage, getMusicInfoSourceRef, type CatalogAlbum } from '@/lib/external-music-info'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { useExternalSourcesStore } from '@/lib/external-source'
import { externalSourceCacheIdentity } from '@/lib/external-source-cache-key'
import { playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { useAppTheme, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing } from '@/theme/tokens'
import { useStyles } from './artist-detail.styles'

type ArtistTab = 'tracks' | 'albums'
type AlbumFilter = 'all' | 'library'

const DEFAULT_ARTIST_HERO = require('../../assets/images/default-artist-hero.jpg')

const TABS: readonly { key: ArtistTab; label: string }[] = [
  { key: 'tracks', label: '歌曲' },
  { key: 'albums', label: '专辑' },
]

/**
 * 2026 旗舰级音乐人主页：
 * - 全屏通顶背景与多段景深渐变过渡；
 * - 44pt 毛玻璃折叠吸顶导航栏（带艺人小标题与吸顶即时播放键）；
 * - 歌曲与专辑两个内容页签；
 * - 完整曲库分页、多选与排序，并合并本地及目录专辑。
 */
export function ArtistDetailScreen() {
  const { mode } = useAppTheme()
  const colors = useThemeColors()
  const styles = useStyles()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()
  const sourceRevision = useExternalSourcesStore((state) => state.revision)
  const sourceServices = useExternalSourcesStore((state) => state.services)
  const sourceIdentity = externalSourceCacheIdentity(sourceServices)
  const catalogSource = getMusicInfoSourceRef()
  const { width } = useWindowDimensions()
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const current = usePlayerStore(selectCurrent)
  const toast = useToast()
  const isFavorited = useLocalFavoritesStore((s) => (connection ? s.isArtistFavorited(connection.id, id) : false))
  const toggleArtistFavorite = useLocalFavoritesStore((s) => s.toggleArtist)

  const insets = useSafeAreaInsets()
  const topHeaderOffset = Math.max(insets.top, 20) + 44
  const [tracksHeaderHeight, setTracksHeaderHeight] = useState(0)
  const [toolbarHeight, setToolbarHeight] = useState(0)
  const [isToolbarPinned, setIsToolbarPinned] = useState(false)
  const [tabsHeight, setTabsHeight] = useState(48)
  const pinAt = Math.max(0, tracksHeaderHeight - toolbarHeight - (topHeaderOffset + tabsHeight))

  const [tab, setTab] = useState<ArtistTab>('tracks')
  const [albumFilter, setAlbumFilter] = useState<AlbumFilter>('all')
  const activeTabIndex = Math.max(0, TABS.findIndex((t) => t.key === tab))
  const albumsListRef = useRef<Animated.FlatList>(null)
  const tracksListRef = useRef<Animated.FlatList>(null)
  const scrollYRef = useRef(0)
  const [headerHeight, setHeaderHeight] = useState(392)
  const [tabsY, setTabsY] = useState(352)
  const scrollYAnim = useSharedValue(0)
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: -Math.max(0, scrollYAnim.value) }]
    }
  })
  const [pinned, setPinned] = useState(false)
  useFocusEffect(useCallback(() => {
    const entry = StatusBar.pushStackEntry({ barStyle: !pinned || mode === 'dark' ? 'light-content' : 'dark-content' })
    return () => StatusBar.popStackEntry(entry)
  }, [pinned, mode]))

  // 1. 本地专辑分页查询
  const albums = usePagedQuery({
    queryKey: ['artist-albums', connection?.id, id],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.artistAlbums(id, { page, size: 40 }),
  })
  const localAlbums = albums.items
  const localAlbumQuery = albums.query
  const {
    hasNextPage: hasNextLocalAlbumPage,
    isFetchingNextPage: isFetchingLocalAlbumPage,
    isFetchNextPageError: isLocalAlbumPageError,
    fetchNextPage: fetchNextLocalAlbumPage,
  } = localAlbumQuery


  // 3. 歌曲分页排序查询
  const { selection, setSelection, sortKey, sort } = useListSort('artistTracks')
  const [selecting, setSelecting] = useState(false)
  const allTracks = usePagedQuery<Track>({
    queryKey: ['artist-tracks-all', connection?.id, id, sortKey],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.artistTracks(id, { page, size: 50, sort }),
  })

  const trackTotalRaw = allTracks.total

  // 3.5 权威艺术家详情（名字 + 专辑数 / 曲目数）：
  // 旧做法从首首曲目/专辑里反推名字，“无曲目也无专辑”的艺术家就显不出名字。
  // 改用 /artist/detail 的权威值，接口挂了退回反推，不让整页打不开。
  const detailQuery = useQuery({
    queryKey: ['artist-detail', connection?.id, id],
    enabled: Boolean(provider && id),
    staleTime: 1000 * 60 * 5,
    queryFn: () => provider!.artist(id),
  })
  const artistName =
    detailQuery.data?.name ??
    allTracks.items[0]?.artists.find((artist) => artist.id === id)?.name ??
    albums.items[0]?.artists[0]?.name
  const trackTotal = detailQuery.data?.trackCount ?? trackTotalRaw

  // Last.fm / Deezer / 维基百科等外部源已按「默认只用飞牛、不接外部源」的决定移除。
  // 艺人写真改用飞牛自带的艺人封面（artist coverId）；简介/标签/听众数/相似艺人
  // 飞牛不提供，待“用户填写国内源”后再显示（现阶段隐藏）。

  // Configured music-info catalog. Pages stay keyed by both server and source instance.
  const catalogAlbumsQuery = useInfiniteQuery({
    queryKey: ['artist-catalog-albums', connection?.id, id, sourceRevision, sourceIdentity, catalogSource?.instanceId, artistName],
    enabled: Boolean(catalogSource && artistName),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const result = await fetchCanonicalArtistAlbumPage(artistName!, pageParam, catalogSource)
      if (result.status === 'error' || result.status === 'source-changed') throw new Error(result.status)
      return result
    },
    getNextPageParam: (lastPage) => lastPage.status === 'ok' ? lastPage.nextCursor : undefined,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })
  const {
    hasNextPage: hasNextCatalogAlbumPage,
    isFetchingNextPage: isFetchingCatalogAlbumPage,
    isFetchNextPageError: isCatalogAlbumPageError,
    fetchNextPage: fetchNextCatalogAlbumPage,
  } = catalogAlbumsQuery
  const catalogSourceInstanceId = catalogSource?.instanceId
  const catalogAlbums = useMemo(
    () => catalogAlbumsQuery.data?.pages.flatMap((page) => page.status === 'ok' ? page.items : []) ?? [],
    [catalogAlbumsQuery.data],
  )
  // Use the domain matcher only against a complete local inventory, so partial pages cannot
  // turn a not-yet-seen duplicate edition into a confident match or absence.
  const localAlbumsComplete = localAlbumQuery.isSuccess && !localAlbumQuery.isPlaceholderData && !localAlbumQuery.hasNextPage && !localAlbumQuery.isError
  const mergedAlbums = useMemo(() => {
    const completeness = localAlbumsComplete ? computeArtistCompleteness(localAlbums, catalogAlbums) : undefined
    const matchedCatalogIds = new Set<string>()
    const matchForLocal = (localId: string) => completeness?.entries.find(
      (entry) => entry.status === 'inLibrary' && entry.local?.id === localId,
    )
    const rows: {
      key: string
      name: string
      year?: number
      releaseDate?: string
      coverId?: string
      localId?: string
      catalog?: CatalogAlbum
      availability: 'inLibrary' | 'missing' | 'unknown'
      sortTime?: number
    }[] =
      localAlbums.map((local) => {
        const catalog = matchForLocal(local.id)?.canonical as CatalogAlbum | undefined
        if (catalog) matchedCatalogIds.add(catalog.externalId)
        const localYear = local.releaseDate ? Number(local.releaseDate.slice(0, 4)) : undefined
        return {
          key: `local-${local.id}`,
          name: local.name,
          ...(localYear && localYear > 1900 ? { year: localYear } : {}),
          ...(local.releaseDate ? { releaseDate: local.releaseDate } : {}),
          ...(local.coverId ? { coverId: local.coverId } : {}),
          localId: local.id,
          availability: 'inLibrary' as const,
          ...(local.releaseDate ? { sortTime: Date.parse(local.releaseDate) } : local.addedAt ? { sortTime: local.addedAt * 1000 } : {}),
          ...(catalog ? { catalog } : {}),
        }
      })
    for (const entry of catalogAlbums) {
      if (matchedCatalogIds.has(entry.externalId)) continue
      const match = completeness?.entries.find((candidate) => candidate.canonical.externalId === entry.externalId)
      rows.push({
        key: `catalog-${entry.externalId}`,
        name: entry.name,
        ...(entry.year ? { year: entry.year } : {}),
        ...(entry.releaseDate ? { releaseDate: entry.releaseDate } : {}),
        availability: match?.status === 'missing' ? 'missing' : 'unknown',
        ...(entry.releaseDate ? { sortTime: Date.parse(entry.releaseDate) } : {}),
        catalog: entry,
      })
    }
    return catalogSource?.type === 'netease'
      ? rows.sort((a, b) => (b.sortTime ?? -Infinity) - (a.sortTime ?? -Infinity) || a.name.localeCompare(b.name))
      : rows
  }, [localAlbums, catalogAlbums, catalogSource?.type, localAlbumsComplete])
  const visibleAlbums = useMemo(
    () => albumFilter === 'library' ? mergedAlbums.filter((album) => album.localId) : mergedAlbums,
    [albumFilter, mergedAlbums],
  )
  const lastCatalogPage = catalogAlbumsQuery.data?.pages.at(-1)
  const catalogNotice = catalogAlbumsQuery.error
    ? '外部专辑目录加载失败'
    : lastCatalogPage?.status === 'empty'
      ? '信息源没有找到这位艺术家的专辑'
      : lastCatalogPage?.status === 'ambiguous'
        ? '发现多个同名艺术家，专辑目录暂不可用'
        : lastCatalogPage?.status === 'unsupported'
          ? (lastCatalogPage.message ?? '当前音乐信息源暂不支持专辑目录')
          : lastCatalogPage?.status === 'source-changed'
            ? '音乐信息源已变更，请重试'
            : undefined
  const showCatalogFilter = catalogSource?.type === 'netease'

  useEffect(() => {
    if (!catalogSourceInstanceId || !artistName || tab !== 'albums' || isCatalogAlbumPageError) return
    if (hasNextCatalogAlbumPage && !isFetchingCatalogAlbumPage) void fetchNextCatalogAlbumPage()
  }, [artistName, catalogSourceInstanceId, tab, hasNextCatalogAlbumPage, isFetchingCatalogAlbumPage, isCatalogAlbumPageError, fetchNextCatalogAlbumPage])

  useEffect(() => {
    if (tab !== 'albums' || isLocalAlbumPageError) return
    if (hasNextLocalAlbumPage && !isFetchingLocalAlbumPage) void fetchNextLocalAlbumPage()
  }, [tab, isLocalAlbumPageError, hasNextLocalAlbumPage, isFetchingLocalAlbumPage, fetchNextLocalAlbumPage])


  // 播放整套艺人队列
  const playArtistTracks = useCallback(
    async (startIndex = 0, shuffle = false) => {
      const targetQueue = allTracks.items
      if (!provider || !connection || targetQueue.length === 0) return
      await playTrackList({
        provider,
        serverId: connection.id,
        tracks: targetQueue,
        startIndex,
        source: { kind: 'artist', id, label: artistName ? `艺术家 · ${artistName}` : '艺术家' },
        loadMorePage: async (page) => (await provider.artistTracks(id, { page, size: 50, sort })).items,
        loadedPage: allTracks.query.data?.pages.length ?? 1,
      })
      if (shuffle) await toggleShuffle()
    },
    [allTracks.items, allTracks.query.data?.pages.length, artistName, connection, id, provider, sort],
  )

  // 封面回退顺序：艺术家封面、最新专辑封面、首首曲目封面。
  const latestAlbumCoverId = useMemo(() => {
    const list = albums.items
    if (list.length === 0) return undefined
    const sorted = [...list].sort((a, b) => {
      const dateA = a.releaseDate || ''
      const dateB = b.releaseDate || ''
      if (dateA && dateB) return dateB.localeCompare(dateA)
      return (b.addedAt ?? 0) - (a.addedAt ?? 0)
    })
    return sorted[0]?.coverId
  }, [albums.items])
  const backdropCoverId = detailQuery.data?.coverId ?? latestAlbumCoverId ?? allTracks.items[0]?.coverId
  const backdropResource = backdropCoverId && provider ? provider.image(backdropCoverId, 800) : null
  const heroImageUri = backdropResource?.url

  // 滚动监听：触碰阈值折叠吸顶（滚动越过宽幅巨幕 220pt 时平滑过渡为吸顶栏，全部歌曲 tab 下越过 pinAt 时固定工具条）
  const handleScrollJS = useCallback((eventY: number) => {
    scrollYRef.current = eventY
    const isPast = Math.min(220, eventY) === 220
    setPinned((prev) => (prev === isPast ? prev : isPast))

    if (tab === 'tracks' && pinAt > 0) {
      const isToolbarPast = eventY >= pinAt
      setIsToolbarPinned((prev) => (prev === isToolbarPast ? prev : isToolbarPast))
    } else if (tab !== 'tracks') {
      setIsToolbarPinned((prev) => (prev ? false : prev))
    }
  }, [tab, pinAt])

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollYAnim.value = e.contentOffset.y
      runOnJS(handleScrollJS)(e.contentOffset.y)
    },
  })

  const handleTabChange = useCallback((nextTab: ArtistTab) => {
    const currentY = scrollYRef.current
    const maxScroll = Math.max(0, tabsY - (insets.top + 44))
    const targetY = Math.min(maxScroll, Math.max(0, currentY))

    if (nextTab === 'albums') {
      albumsListRef.current?.scrollToOffset({ offset: targetY, animated: false })
    } else if (nextTab === 'tracks') {
      tracksListRef.current?.scrollToOffset({ offset: targetY, animated: false })
    }

    setTab(nextTab)
    setIsToolbarPinned(false)
  }, [tabsY, insets.top])

  const handleToggleFavorite = () => {
    if (!connection || !id) return
    tap()
    const added = toggleArtistFavorite(connection.id, {
      id,
      name: artistName ?? '艺术家',
      coverId: backdropCoverId,
      trackCount: trackTotal,
    })
    toast(added ? '已添加到喜欢' : '已取消喜欢')
  }

  // 播放总时长统计（毫秒）
  const totalDurationMs = useMemo(() => allTracks.query.hasNextPage ? undefined : allTracks.items.reduce((acc, track) => acc + (track.durationMs || 0), 0), [allTracks.items, allTracks.query.hasNextPage])

  const toolbar = (
    <ListToolbar
      kind="artistTracks"
      total={allTracks.total}
      totalDurationMs={totalDurationMs}
      selection={selection}
      onSelect={setSelection}
      onStartSelection={() => setSelecting(true)}
    />
  )

  // 导航栏必须显式声明 headerLeft: () => <StackBackButton /> 满足架构契约，使用 useMemo 保持 options 引用稳定
  const screenOptions = useMemo(
    () => ({
      headerShown: true,
      headerTransparent: true,
      title: pinned ? (artistName ?? '艺术家') : '',
      headerTintColor: pinned || mode === 'light' ? colors.textPrimary : colors.textOnAccent,
      statusBarStyle: pinned ? (mode === 'dark' ? ('light' as const) : ('dark' as const)) : ('light' as const),
      headerLeft: () => <StackBackButton color={pinned || mode === 'light' ? colors.textPrimary : colors.textOnAccent} />,
      headerRight: () =>
        pinned && allTracks.items.length > 0 ? (
          <IconButton
            name="play"
            size={iconSize.md}
            color={colors.textPrimary}
            onPress={() => void playArtistTracks(0)}
            accessibilityLabel="播放全部"
          />
        ) : null,
      headerBackground: () =>
        pinned ? (
          <BlurView
            tint={mode === 'dark' ? 'dark' : 'light'}
            intensity={95}
            style={StyleSheet.absoluteFill}
          />
        ) : null,
    }),
    [pinned, artistName, allTracks.items.length, colors.textPrimary, colors.textOnAccent, mode, playArtistTracks],
  )

  const titleScreen = <Stack.Screen options={screenOptions} />

  if (albums.query.isPending && allTracks.query.isPending) {
    return (
      <>
        {titleScreen}
        <LoadingState />
      </>
    )
  }

  if (albums.query.isLoadingError && allTracks.query.isLoadingError) {
    return (
      <>
        {titleScreen}
        <ErrorState error={albums.query.error} onRetry={() => void albums.query.refetch()} />
      </>
    )
  }

  // 专辑网格列宽
  const columns = width >= 700 ? 3 : 2
  const gap = spacing.md
  const albumItemWidth = (width - spacing.lg * 2 - gap * (columns - 1)) / columns

  // 元数据标签文本（只用飞牛自有的专辑/曲目计数）
  const metaParts = [
    albums.total ? `曲库 ${albums.total} 张专辑` : undefined,
    trackTotal ? `${trackTotal} 首歌曲` : undefined,
  ].filter(Boolean)
  const metaText = metaParts.join(' · ')

  // 头部通顶巨幕组件（横向 100% 铺满宽画幅写真 + 电影级渐变融边 + 巨幅大字下沉排版）
  const headerComponent = (
    <View style={styles.heroRoot}>
      {/* 1. 宽幅通顶大画卷 */}
      <View style={styles.billboardContainer}>
        {heroImageUri ? (
          <Image
            source={{ uri: heroImageUri, headers: backdropResource?.headers }}
            style={styles.billboardImage}
            contentFit="cover"
            transition={250}
            cachePolicy="memory-disk"
          />
        ) : (
          <Image
            source={DEFAULT_ARTIST_HERO}
            style={styles.billboardImage}
            contentFit="cover"
            transition={250}
          />
        )}

        {/* 顶部暗色微晕：防眩光，确保无论写真背景明暗，iOS 时间、电池、返回键均 100% 清晰 */}
        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.25)', 'transparent']}
          locations={[0, 0.45, 1]}
          style={styles.topVignette}
          pointerEvents="none"
        />

        {/* 底部电影级非线性渐变融边：自然平滑溶解进页面底色 */}
        <LinearGradient
          colors={
            mode === 'dark'
              ? ['transparent', 'rgba(10,10,12,0.45)', 'rgba(10,10,12,0.85)', colors.bgPrimary]
              : ['transparent', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.85)', colors.bgPrimary]
          }
          locations={[0, 0.42, 0.78, 1]}
          style={styles.bottomDissolve}
          pointerEvents="none"
        />

        {/* 2. 下沉式巨幅文字与悬浮操作组 */}
        <View style={styles.heroInfoOverlay}>
          {/* 巨幅艺人标题 */}
          <Text numberOfLines={1} style={styles.heroArtistName}>
            {artistName ?? '艺术家'}
          </Text>

          {/* 全网热度与馆藏元数据 */}
          {metaText ? (
            <Text numberOfLines={1} style={styles.heroMetaText}>
              {metaText}
            </Text>
          ) : null}

              {/* 播放与喜欢操作胶囊 */}
          <DetailActionCapsules
            onPlay={() => void playArtistTracks(0)}
            onToggleFavorite={handleToggleFavorite}
            favorite={isFavorited}
            canPlay={allTracks.items.length > 0}
            playDisabledLabel={allTracks.query.isPending ? '正在加载' : '暂无歌曲'}
          />
        </View>
      </View>

      {/* 3. 随页面自然滚动的分类页签（歌曲 | 专辑） */}
      <View style={styles.tabsWrapper} onLayout={(e) => { setTabsY(e.nativeEvent.layout.y); setTabsHeight(e.nativeEvent.layout.height); }}>
        <SegmentedTabs items={TABS} value={tab} onChange={handleTabChange} accessibilityLabel="音乐人内容分类" />
      </View>
    </View>
  )

  return (
    <View style={styles.root}>
      {titleScreen}

      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }, headerAnimatedStyle]} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
        {headerComponent}
      </Animated.View>

      <TabPager activeIndex={activeTabIndex} lazy={false} style={styles.flex}>
        {/* ========== TAB 1: 歌曲 (Tracks) ========== */}
        <View style={styles.flex}>
          <Animated.FlatList
            ref={tracksListRef}
            data={allTracks.items}
            keyExtractor={(item) => `all-${item.id}`}
            contentContainerStyle={[styles.contentGrow, { paddingBottom: bottom + 24 }]}
            scrollEventThrottle={16}
            onScroll={scrollHandler}
            ListHeaderComponent={
              <View onLayout={(e) => setTracksHeaderHeight(e.nativeEvent.layout.height)}>
                <View style={{ height: headerHeight }} />
                <View
                  style={styles.toolbarSlot}
                  onLayout={(e) => setToolbarHeight(e.nativeEvent.layout.height)}
                >
                  {toolbar}
                </View>
              </View>
            }
            ListEmptyComponent={<EmptyState text="这位艺术家还没有歌曲" />}
            renderItem={({ item, index }) => (
              <View style={styles.trackRowWrapper}>
                <TrackRow
                  track={item}
                  index={index}
                  leading="cover"
                  playing={current?.serverId === connection?.id && current?.trackId === item.id}
                  onPress={() => {
                    if (!provider || !connection) return
                    void playTrackList({
                      provider,
                      serverId: connection.id,
                      tracks: allTracks.items,
                      startIndex: index,
                      source: { kind: 'artist', id, label: `艺术家 · ${artistName}` },
                      loadMorePage: async (page) => (await provider.artistTracks(id, { page, size: 50, sort })).items,
                      loadedPage: allTracks.query.data?.pages.length ?? 1,
                    })
                  }}
                />
              </View>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onEndReached={allTracks.loadMore}
            ListFooterComponent={
              <PaginationFooter
                loading={allTracks.query.isFetchingNextPage}
                error={allTracks.query.isFetchNextPageError ? allTracks.query.error : undefined}
                onRetry={() => void allTracks.query.fetchNextPage()}
              />
            }
          />
        </View>

        {/* ========== TAB 2: 专辑网格 (Albums) ========== */}
        <View style={styles.flex}>
          <Animated.FlatList
            ref={albumsListRef}
            data={visibleAlbums}
            key={columns}
            numColumns={columns}
            keyExtractor={(item) => `alb-${item.key}`}
            contentContainerStyle={[styles.contentGrow, { paddingBottom: bottom + 24 }]}
            columnWrapperStyle={{ gap, paddingHorizontal: spacing.lg }}
            scrollEventThrottle={16}
            onScroll={scrollHandler}
            ListHeaderComponent={
              <View>
                <View style={{ height: headerHeight }} />
                {showCatalogFilter ? <View style={styles.albumFilterRow}>
                  {([{ key: 'all', label: '全部' }, { key: 'library', label: '已入库' }] as const).map((filter) => (
                    <Pressable key={filter.key} onPress={() => setAlbumFilter(filter.key)} accessibilityRole="button" accessibilityState={{ selected: albumFilter === filter.key }} style={[styles.albumFilter, albumFilter === filter.key && styles.albumFilterSelected]}>
                      <Text style={[styles.albumFilterText, albumFilter === filter.key && styles.albumFilterTextSelected]}>{filter.label}</Text>
                    </Pressable>
                  ))}
                </View> : null}
                {catalogNotice ? (
                  <View style={styles.catalogNotice}>
                    <Text style={styles.catalogNoticeText}>{catalogNotice}</Text>
                    {catalogAlbumsQuery.error || lastCatalogPage?.status === 'ambiguous' || lastCatalogPage?.status === 'unsupported' ? (
                      <Pressable onPress={() => void catalogAlbumsQuery.refetch()} accessibilityRole="button"><Text style={styles.catalogRetry}>重试</Text></Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={<EmptyState text={catalogSource && catalogAlbumsQuery.isPending ? '正在读取专辑目录' : '这位艺术家还没有专辑'} />}
            renderItem={({ item }) => {
              const itemHref = item.catalog ? href.catalogAlbum(item.catalog.source, item.catalog.externalId, item.catalog.artistName, item.catalog.name, item.localId, item.catalog.coverUrl, id, item.catalog.year, item.catalog.edition) : href.album(item.localId!)
              return (
                <Link href={itemHref} asChild>
                  <Pressable style={{ width: albumItemWidth }} accessibilityRole="button" accessibilityLabel={`专辑 ${item.name}`}>
                    {item.localId ? <CoverImage coverId={item.coverId} size={albumItemWidth} borderRadius={radius.md} /> : item.catalog?.coverUrl ? <Image source={{ uri: item.catalog.coverUrl }} style={{ width: albumItemWidth, height: albumItemWidth, borderRadius: radius.md, backgroundColor: colors.skeleton2 }} contentFit="cover" /> : <CoverImage size={albumItemWidth} borderRadius={radius.md} />}
                    <Text numberOfLines={1} style={styles.gridAlbumName}>{item.name}</Text>
                    <Text numberOfLines={1} style={styles.gridAlbumYear}>{item.year ? `${item.year}年 · ${item.localId ? '已入库' : item.availability === 'missing' ? '未入库' : '待核对'}` : item.localId ? '已入库' : item.availability === 'missing' ? '未入库' : '待核对'}</Text>
                  </Pressable>
                </Link>
              )
            }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            onEndReached={() => {
              albums.loadMore()
              if (catalogAlbumsQuery.hasNextPage && !catalogAlbumsQuery.isFetchingNextPage) void catalogAlbumsQuery.fetchNextPage()
            }}
            ListFooterComponent={
              <>
                <PaginationFooter
                  loading={albums.query.isFetchingNextPage || catalogAlbumsQuery.isFetchingNextPage}
                  error={albums.query.isFetchNextPageError ? albums.query.error : catalogAlbumsQuery.isFetchNextPageError ? catalogAlbumsQuery.error : undefined}
                  onRetry={() => {
                    if (catalogAlbumsQuery.isFetchNextPageError) void catalogAlbumsQuery.fetchNextPage()
                    else if (albums.query.isFetchNextPageError) void albums.query.fetchNextPage()
                  }}
                />
              </>
            }
          />
        </View>
      </TabPager>

      {/* 滚动过头部后吸附顶部的精简工具条 */}
      {tab === 'tracks' && isToolbarPinned && allTracks.total > 0 ? (
        <DetailPinnedToolbar top={topHeaderOffset + tabsHeight}>
          {toolbar}
        </DetailPinnedToolbar>
      ) : null}

      {/* 批量多选模态窗 */}
      <TrackSelectionModal
        visible={selecting}
        items={allTracks.items}
        source={{ kind: 'artist', id, label: `艺术家 · ${artistName}` }}
        leading="cover"
        isPlaying={(trackId) => current?.serverId === connection?.id && current?.trackId === trackId}
        onEndReached={allTracks.loadMore}
        footer={
          <PaginationFooter
            loading={allTracks.query.isFetchingNextPage}
            error={allTracks.query.isFetchNextPageError ? allTracks.query.error : undefined}
            onRetry={() => void allTracks.query.fetchNextPage()}
          />
        }
        onClose={() => setSelecting(false)}
      />
    </View>
  )
}
