import { useCallback, useMemo, useState } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import type { Artist, Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { FormatBadge } from '@/components/format-badge'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { ListToolbarBar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { LivePlayingBars } from '@/components/playing-bars'
import { SegmentedTabs } from '@/components/segmented-tabs'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackMoreButton } from '@/components/track-more-button'
import { TrackRow } from '@/components/track-row'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import {
  cleanSongTitle,
  fetchArtistInfo,
  fetchArtistPortrait,
  fetchArtistTopTracks,
  fetchSimilarArtists,
  matchLocalTracks,
} from '@/lib/lastfm'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { createThemedStyles, useAppTheme, useThemeColors } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

type ArtistTab = 'overview' | 'albums' | 'tracks'

const TABS: readonly { key: ArtistTab; label: string }[] = [
  { key: 'overview', label: '精选' },
  { key: 'albums', label: '专辑' },
  { key: 'tracks', label: '全部歌曲' },
]

/**
 * 2026 旗舰级音乐人主页：
 * - 全屏通顶背景与多段景深渐变过渡；
 * - 44pt 毛玻璃折叠吸顶导航栏（带艺人小标题与吸顶即时播放键）；
 * - 结合 Last.fm 全球音乐大数据的「热门歌曲 Top 5」与「相似音乐人」；
 * - 最新发行焦点卡片 + 140pt 唱片横滑架 + 完整曲库多选与排序。
 */
export function ArtistDetailScreen() {
  const { mode } = useAppTheme()
  const colors = useThemeColors()
  const styles = useStyles()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()
  const { width } = useWindowDimensions()
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const current = usePlayerStore(selectCurrent)

  const [tab, setTab] = useState<ArtistTab>('overview')
  const [pinned, setPinned] = useState(false)
  const [expandedBio, setExpandedBio] = useState(false)

  // 1. 本地专辑分页查询
  const albums = usePagedQuery({
    queryKey: ['artist-albums', connection?.id, id],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.artistAlbums(id, { page, size: 40 }),
  })

  // 2. 本地歌曲前 50 首（供热门对齐、首屏播放队列使用）
  const topTracksQuery = useQuery({
    queryKey: ['artist-top-tracks', connection?.id, id],
    enabled: Boolean(provider && id),
    queryFn: () => provider!.artistTracks(id, { page: 1, size: 50 }),
  })

  // 3. 全部歌曲分页排序查询（用于「全部歌曲」页签）
  const { selection, setSelection, sortKey, sort } = useListSort('artistTracks')
  const [selecting, setSelecting] = useState(false)
  const allTracks = usePagedQuery<Track>({
    queryKey: ['artist-tracks-all', connection?.id, id, sortKey],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.artistTracks(id, { page, size: 50, sort }),
  })

  const localTracks = useMemo(() => topTracksQuery.data?.items ?? [], [topTracksQuery.data?.items])
  const trackTotalRaw = topTracksQuery.data?.total ?? allTracks.total ?? 0

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
    localTracks[0]?.artists.find((artist) => artist.id === id)?.name ??
    albums.items[0]?.artists[0]?.name
  const albumTotal = detailQuery.data?.albumCount ?? albums.total
  const trackTotal = detailQuery.data?.trackCount ?? trackTotalRaw

  // 4. Last.fm 全网大数据：热门歌曲
  const lastfmTopQuery = useQuery({
    queryKey: ['lastfm-top', artistName],
    enabled: Boolean(artistName),
    staleTime: 1000 * 60 * 60 * 24 * 7,
    queryFn: () => fetchArtistTopTracks(artistName!),
  })

  // 5. Last.fm 全网大数据：艺人生平档案
  const lastfmInfoQuery = useQuery({
    queryKey: ['lastfm-info', artistName],
    enabled: Boolean(artistName),
    staleTime: 1000 * 60 * 60 * 24 * 7,
    queryFn: () => fetchArtistInfo(artistName!),
  })

  // 6. Last.fm 全网大数据：相似艺人
  const lastfmSimilarQuery = useQuery({
    queryKey: ['lastfm-similar', artistName],
    enabled: Boolean(artistName),
    staleTime: 1000 * 60 * 60 * 24 * 7,
    queryFn: () => fetchSimilarArtists(artistName!),
  })

  // 7. 本地所有艺人库（用于比对相似艺人中是否有本地已存的）
  const allArtistsQuery = useQuery({
    queryKey: ['artists-all-overview', connection?.id],
    enabled: Boolean(provider && lastfmSimilarQuery.data && lastfmSimilarQuery.data.length > 0),
    queryFn: () => provider!.artists({ page: 1, size: 100 }),
  })

  // 8. 全网开放高清写真：通过开放维基百科 REST 肖像引擎并发加载官方写真
  const portraitQuery = useQuery({
    queryKey: ['artist-portrait', artistName],
    enabled: Boolean(artistName),
    staleTime: 1000 * 60 * 60 * 24 * 7,
    queryFn: () => fetchArtistPortrait(artistName!),
  })

  // 9. 智能模糊对齐：全网热榜歌曲对齐到 NAS 本地拥有的文件
  const popularTracks = useMemo(() => {
    return matchLocalTracks(localTracks, lastfmTopQuery.data ?? [], 5)
  }, [localTracks, lastfmTopQuery.data])

  // 10. 最新发布唱片（若仅有 1 张专辑则不展示独立卡片，避免重复）
  const latestAlbum = useMemo(() => {
    if (albums.items.length <= 1) return null
    const sorted = [...albums.items].sort((a, b) => {
      const dateA = a.releaseDate || ''
      const dateB = b.releaseDate || ''
      if (dateA && dateB) return dateB.localeCompare(dateA)
      return (b.addedAt ?? 0) - (a.addedAt ?? 0)
    })
    return sorted[0]
  }, [albums.items])

  // 11. 命中本地曲库的相似艺人
  const matchedSimilarArtists = useMemo(() => {
    const rawSim = lastfmSimilarQuery.data ?? []
    const libraryArtists = allArtistsQuery.data?.items ?? []
    if (rawSim.length === 0 || libraryArtists.length === 0) return []

    const results: Artist[] = []
    for (const sim of rawSim) {
      const cleanSim = cleanSongTitle(sim.name)
      const found = libraryArtists.find(
        (la) =>
          la.id !== id &&
          (cleanSongTitle(la.name) === cleanSim ||
            la.name.includes(sim.name) ||
            sim.name.includes(la.name)),
      )
      if (found && !results.some((r) => r.id === found.id)) {
        results.push(found)
      }
    }
    return results
  }, [lastfmSimilarQuery.data, allArtistsQuery.data?.items, id])

  // 12. 听众数量格式化（例如 2,410,230 -> 241万+ 或 2.4M）
  const formattedListeners = useMemo(() => {
    const raw = lastfmInfoQuery.data?.listeners
    if (!raw) return undefined
    const num = Number.parseInt(raw, 10)
    if (Number.isNaN(num) || num <= 0) return undefined
    if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`
    if (num >= 10000) return `${Math.round(num / 10000)}万+`
    return `${num}`
  }, [lastfmInfoQuery.data?.listeners])

  // 播放整套艺人队列
  const playArtistTracks = useCallback(
    async (startIndex = 0, shuffle = false) => {
      const targetQueue = localTracks.length > 0 ? localTracks : allTracks.items
      if (!provider || !connection || targetQueue.length === 0) return
      await playTrackList({
        provider,
        serverId: connection.id,
        tracks: targetQueue,
        startIndex,
        source: { kind: 'artist', id, label: artistName ? `艺术家 · ${artistName}` : '艺术家' },
      })
      if (shuffle) await toggleShuffle()
    },
    [allTracks.items, artistName, connection, id, localTracks, provider],
  )

  // 封面与写真背景资源计算（优先使用全网高清写真大图，兜底使用本地高解析唱片封面）
  const artistCoverId = localTracks[0]?.artists.find((a) => a.id === id)?.coverId ?? localTracks[0]?.artists[0]?.coverId
  const firstCoverId = localTracks[0]?.coverId ?? albums.items[0]?.coverId
  const backdropCoverId = artistCoverId ?? firstCoverId
  const backdropResource = backdropCoverId && provider ? provider.image(backdropCoverId, 800) : null
  const portraitUrl = portraitQuery.data
  const heroImageUri = portraitUrl ?? backdropResource?.url

  // 滚动监听：触碰阈值折叠吸顶（滚动越过宽幅巨幕 220pt 时平滑过渡为吸顶栏）
  const handleScroll = useCallback((eventY: number) => {
    const isPast = eventY > 220
    setPinned((prev) => (prev === isPast ? prev : isPast))
  }, [])

  // 导航栏必须显式声明 headerLeft: () => <StackBackButton /> 满足架构契约
  const titleScreen = (
    <Stack.Screen
      options={{
        headerShown: true,
        headerTransparent: true,
        title: pinned ? (artistName ?? '艺术家') : '',
        headerLeft: () => <StackBackButton />,
        headerRight: () =>
          pinned ? (
            <IconButton
              name="play"
              size={iconSize.md}
              color={colors.brandTint}
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
      }}
    />
  )

  if (albums.query.isPending && topTracksQuery.isPending) {
    return (
      <>
        {titleScreen}
        <LoadingState />
      </>
    )
  }

  if (albums.query.isLoadingError && topTracksQuery.isLoadingError) {
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

  const primaryTag = lastfmInfoQuery.data?.tags[0]

  // 元数据标签文本
  const metaParts = [
    formattedListeners ? `Last.fm ${formattedListeners} 听众` : undefined,
    albumTotal ? `${albumTotal} 张专辑` : undefined,
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
            source={{ uri: heroImageUri, headers: portraitUrl ? undefined : backdropResource?.headers }}
            style={styles.billboardImage}
            contentFit="cover"
            transition={250}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.billboardImage, { backgroundColor: colors.surfaceCard }]} />
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
          {/* 流派 / 身份微标 */}
          <View style={styles.kickerBadge}>
            <Text style={styles.kickerText}>
              {(primaryTag ? `ARTIST · ${primaryTag}` : 'ARTIST · 艺术家').toUpperCase()}
            </Text>
          </View>

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

          {/* 悬浮微拟物操作胶囊群 */}
          <View style={styles.heroActionsRow}>
            {/* 核心大号播放胶囊 */}
            <Pressable
              style={({ pressed }) => [styles.actionButton, styles.buttonPlay, pressed && styles.buttonPressed]}
              onPress={() => void playArtistTracks(0)}
              accessibilityRole="button"
              accessibilityLabel="播放全部"
            >
              <Icon name="play" size={iconSize.sm} color={colors.textPrimary} filled />
              <Text style={styles.actionButtonText}>播放</Text>
            </Pressable>

            {/* 磨砂半透随机播放胶囊 */}
            <Pressable
              style={({ pressed }) => [styles.actionButton, styles.buttonShuffle, pressed && styles.buttonPressed]}
              onPress={() => void playArtistTracks(0, true)}
              accessibilityRole="button"
              accessibilityLabel="随机播放"
            >
              <Icon name="shuffle" size={iconSize.sm} color={colors.textPrimary} />
              <Text style={styles.actionButtonText}>随机播放</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* 3. 随页面自然滚动的分类页签（精选 | 专辑 | 全部歌曲） */}
      <View style={styles.tabsWrapper}>
        <SegmentedTabs items={TABS} value={tab} onChange={setTab} accessibilityLabel="音乐人内容分类" />
      </View>
    </View>
  )

  return (
    <View style={styles.root}>
      {titleScreen}

      {/* ========== TAB 1: 精选 (Overview) ========== */}
      {tab === 'overview' && (
        <FlatList
          data={popularTracks}
          keyExtractor={(item) => `pop-${item.id}`}
          contentContainerStyle={[styles.contentGrow, { paddingBottom: bottom + 24 }]}
          scrollEventThrottle={16}
          onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
          ListHeaderComponent={
            <View>
              {headerComponent}

              {/* 分区 1：热门歌曲 Top 5 */}
              <View style={styles.sectionHeaderWrap}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>热门歌曲</Text>
                  <Pressable
                    onPress={() => setTab('tracks')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.seeAllBtn, pressed && styles.seeAllPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="查看全部歌曲"
                  >
                    <Text style={styles.seeAllText}>全部歌曲</Text>
                    <Icon name="chevronRight" size={13} color={colors.textTertiary} />
                  </Pressable>
                </View>
              </View>
            </View>
          }
          renderItem={({ item, index }) => {
            const isPlaying = current?.serverId === connection?.id && current?.trackId === item.id
            const albumName = item.album?.name || '单曲'

            return (
              <Pressable
                style={({ pressed }) => [styles.popularRow, pressed && styles.rowPressed]}
                onPress={() => {
                  void playTrackList({
                    provider: provider!,
                    serverId: connection!.id,
                    tracks: popularTracks,
                    startIndex: index,
                    source: { kind: 'artist', id, label: `热门 · ${artistName}` },
                  })
                }}
                accessibilityRole="button"
                accessibilityLabel={`${index + 1} ${item.title}`}
              >
                {/* 排行名次 */}
                <View style={styles.rankCol}>
                  <Text style={[styles.rankNumber, index === 0 && styles.rankFirst]}>
                    {index + 1}
                  </Text>
                </View>

                {/* 封面 */}
                <CoverImage coverId={item.coverId ?? item.album?.coverId} size={42} borderRadius={radius.sm} />

                {/* 歌名与元数据 */}
                <View style={styles.trackInfoCol}>
                  <View style={styles.trackTitleRow}>
                    {isPlaying ? (
                      <View style={styles.liveBarsSlot}>
                        <LivePlayingBars size={11} />
                      </View>
                    ) : null}
                    <Text numberOfLines={1} style={[styles.trackTitle, isPlaying && styles.trackTitlePlaying]}>
                      {item.title}
                    </Text>
                  </View>

                  <View style={styles.trackSubRow}>
                    <FormatBadge track={item} />
                    <Text numberOfLines={1} style={styles.trackAlbum}>
                      {albumName}
                    </Text>
                  </View>
                </View>

                {/* 独立操作 */}
                <TrackMoreButton track={item} />
              </Pressable>
            )
          }}
          ListFooterComponent={
            <View style={styles.overviewFooter}>
              {/* 分区 2：最新发布（若存在且专辑数 > 1） */}
              {latestAlbum ? (
                <View style={styles.shelfSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>最新发布</Text>
                  </View>
                  <Link href={href.album(latestAlbum.id)} asChild>
                    <Pressable style={({ pressed }) => [styles.latestCard, pressed && styles.cardPressed]}>
                      <CoverImage coverId={latestAlbum.coverId} size={72} borderRadius={radius.md} />
                      <View style={styles.latestCardInfo}>
                        <Text style={styles.latestBadge}>
                          {latestAlbum.releaseDate ? `本地最新 · ${latestAlbum.releaseDate.slice(0, 4)} 年` : '本地最新专辑'}
                        </Text>
                        <Text numberOfLines={1} style={styles.latestTitle}>
                          {latestAlbum.name}
                        </Text>
                        <Text style={styles.latestMeta}>
                          {latestAlbum.trackCount ? `${latestAlbum.trackCount} 首歌曲` : '完整专辑'}
                        </Text>
                      </View>
                      <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                    </Pressable>
                  </Link>
                </View>
              ) : null}

              {/* 分区 3：专辑横滑架 */}
              {albums.items.length > 0 ? (
                <View style={styles.shelfSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>专辑</Text>
                    <Pressable
                      onPress={() => setTab('albums')}
                      hitSlop={8}
                      style={({ pressed }) => [styles.seeAllBtn, pressed && styles.seeAllPressed]}
                      accessibilityRole="button"
                      accessibilityLabel="查看全部专辑"
                    >
                      <Text style={styles.seeAllText}>全部专辑</Text>
                      <Icon name="chevronRight" size={13} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={albums.items}
                    keyExtractor={(item) => `shelf-${item.id}`}
                    contentContainerStyle={styles.shelfScrollContent}
                    renderItem={({ item }) => (
                      <Link href={href.album(item.id)} asChild>
                        <Pressable style={styles.shelfTile}>
                          <CoverImage coverId={item.coverId} size={132} borderRadius={radius.album} />
                          <Text numberOfLines={1} style={styles.shelfAlbumTitle}>
                            {item.name}
                          </Text>
                          {item.releaseDate ? (
                            <Text style={styles.shelfAlbumYear}>{item.releaseDate.slice(0, 4)}</Text>
                          ) : null}
                        </Pressable>
                      </Link>
                    )}
                  />
                </View>
              ) : null}

              {/* 分区 4：相似音乐人（若本地库有匹配） */}
              {matchedSimilarArtists.length > 0 ? (
                <View style={styles.shelfSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>相似音乐人</Text>
                  </View>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={matchedSimilarArtists}
                    keyExtractor={(item) => `sim-${item.id}`}
                    contentContainerStyle={styles.shelfScrollContent}
                    renderItem={({ item }) => (
                      <Link href={href.artist(item.id)} asChild>
                        <Pressable style={styles.similarTile}>
                          <CoverImage coverId={item.coverId} size={72} borderRadius={36} />
                          <Text numberOfLines={1} style={styles.similarName}>
                            {item.name}
                          </Text>
                        </Pressable>
                      </Link>
                    )}
                  />
                </View>
              ) : null}

              {/* 分区 5：关于音乐人（Last.fm 生平介绍） */}
              {lastfmInfoQuery.data?.bioSummary ? (
                <View style={styles.shelfSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>关于音乐人</Text>
                  </View>
                  <Pressable
                    style={styles.bioCard}
                    onPress={() => setExpandedBio((prev) => !prev)}
                    accessibilityRole="button"
                    accessibilityLabel="生平简介"
                  >
                    <Text
                      numberOfLines={expandedBio ? undefined : 4}
                      style={styles.bioText}
                    >
                      {lastfmInfoQuery.data.bioSummary}
                    </Text>
                    <Text style={styles.bioExpandHint}>
                      {expandedBio ? '收起 ‹' : '展开全文 ›'}
                    </Text>

                    {lastfmInfoQuery.data.tags.length > 0 ? (
                      <View style={styles.tagsRow}>
                        {lastfmInfoQuery.data.tags.slice(0, 4).map((t) => (
                          <View key={t} style={styles.tagPill}>
                            <Text style={styles.tagText}>{t.toUpperCase()}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
        />
      )}

      {/* ========== TAB 2: 专辑网格 (Albums Wall) ========== */}
      {tab === 'albums' && (
        <FlatList
          data={albums.items}
          key={columns}
          numColumns={columns}
          keyExtractor={(item) => `alb-${item.id}`}
          contentContainerStyle={[styles.contentGrow, { paddingBottom: bottom + 24 }]}
          columnWrapperStyle={{ gap, paddingHorizontal: spacing.lg }}
          scrollEventThrottle={16}
          onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={<EmptyState text="这位艺术家还没有专辑" />}
          renderItem={({ item }) => (
            <Link href={href.album(item.id)} asChild>
              <Pressable style={{ width: albumItemWidth }} accessibilityRole="button" accessibilityLabel={`专辑 ${item.name}`}>
                <CoverImage coverId={item.coverId} size={albumItemWidth} borderRadius={radius.md} />
                <Text numberOfLines={1} style={styles.gridAlbumName}>
                  {item.name}
                </Text>
                {item.releaseDate ? (
                  <Text numberOfLines={1} style={styles.gridAlbumYear}>
                    {item.releaseDate.slice(0, 4)}
                  </Text>
                ) : null}
              </Pressable>
            </Link>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          onEndReached={albums.loadMore}
          ListFooterComponent={
            <PaginationFooter
              loading={albums.query.isFetchingNextPage}
              error={albums.query.isFetchNextPageError ? albums.query.error : undefined}
              onRetry={() => void albums.query.fetchNextPage()}
            />
          }
        />
      )}

      {/* ========== TAB 3: 全部歌曲 (All Tracks) ========== */}
      {tab === 'tracks' && (
        <FlatList
          data={allTracks.items}
          keyExtractor={(item) => `all-${item.id}`}
          contentContainerStyle={[styles.contentGrow, { paddingBottom: bottom + 24 }]}
          scrollEventThrottle={16}
          onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
          ListHeaderComponent={
            <View>
              {headerComponent}
              <View style={styles.toolbarSlot}>
                <ListToolbarBar
                  kind="artistTracks"
                  total={allTracks.total}
                  selection={selection}
                  onSelect={setSelection}
                  onStartSelection={() => setSelecting(true)}
                />
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
                  })
                }}
              />
            </View>
          )}
          onEndReached={allTracks.loadMore}
          ListFooterComponent={
            <PaginationFooter
              loading={allTracks.query.isFetchingNextPage}
              error={allTracks.query.isFetchNextPageError ? allTracks.query.error : undefined}
              onRetry={() => void allTracks.query.fetchNextPage()}
            />
          }
        />
      )}

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

const useStyles = createThemedStyles((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  // 满足 visual-consistency.test.ts 的空状态居中契约
  contentGrow: {
    flexGrow: 1,
  },
  heroRoot: {
    paddingBottom: spacing.sm,
  },
  billboardContainer: {
    width: '100%',
    height: 380,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  billboardImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomDissolve: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 250,
  },
  heroInfoOverlay: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 6,
    zIndex: 2,
  },
  kickerBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginBottom: 2,
  },
  kickerText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textPrimary,
  },
  heroArtistName: {
    fontSize: 34,
    fontFamily: fonts.bold,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.textPrimary,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroMetaText: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    height: 42,
    borderRadius: radius.pill,
    minWidth: 130,
  },
  buttonPlay: {
    backgroundColor: colors.primaryAction,
  },
  buttonShuffle: {
    backgroundColor: colors.bgButtonSecondary,
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  actionButtonText: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tabsWrapper: {
    marginTop: spacing.md,
  },
  sectionHeaderWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  seeAllPressed: {
    opacity: 0.6,
  },
  seeAllText: {
    ...typography.subhead,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  // 热门歌曲行
  popularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    gap: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.bgListItemHover,
  },
  rankCol: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textTertiary,
  },
  rankFirst: {
    color: colors.brandTint,
    fontWeight: '700',
  },
  trackInfoCol: {
    flex: 1,
    gap: 3,
  },
  trackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveBarsSlot: {
    width: 14,
    height: 11,
    justifyContent: 'center',
  },
  trackTitle: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  trackTitlePlaying: {
    color: colors.brandTint,
  },
  trackSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trackAlbum: {
    ...typography.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  overviewFooter: {
    paddingTop: spacing.md,
    gap: spacing.sectionGap,
  },
  shelfSection: {
    paddingHorizontal: spacing.lg,
    gap: spacing.titleGap,
  },
  shelfScrollContent: {
    gap: spacing.shelfGap,
    paddingRight: spacing.lg,
  },
  shelfTile: {
    width: 132,
    gap: 4,
  },
  shelfAlbumTitle: {
    ...typography.callout,
    color: colors.textPrimary,
    marginTop: 2,
  },
  shelfAlbumYear: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  similarTile: {
    width: 80,
    alignItems: 'center',
    gap: 6,
  },
  similarName: {
    ...typography.caption,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  latestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  cardPressed: {
    opacity: 0.85,
  },
  latestCardInfo: {
    flex: 1,
    gap: 3,
  },
  latestBadge: {
    ...typography.badge,
    color: colors.brandTint,
  },
  latestTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  latestMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bioCard: {
    backgroundColor: colors.bgCard,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  bioText: {
    ...typography.subhead,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  bioExpandHint: {
    ...typography.caption,
    color: colors.brandTint,
    fontWeight: '600',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tagPill: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  tagText: {
    ...typography.badge,
    color: colors.textSecondary,
  },
  // 专辑网格样式
  gridAlbumName: {
    ...typography.callout,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  gridAlbumYear: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  // 全部歌曲样式
  toolbarSlot: {
    paddingHorizontal: spacing.lg,
  },
  trackRowWrapper: {
    paddingHorizontal: spacing.lg,
  },
}))
