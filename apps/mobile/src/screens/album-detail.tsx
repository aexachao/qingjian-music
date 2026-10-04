import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import { computeAlbumCompleteness, inferTrackGaps, normalizeName, type Album, type Track } from '@qj/core-domain'
import { fetchCanonicalAlbumTracks, getMusicInfoSourceRef, type CatalogPage, type CatalogTrack, type MusicInfoSourceRef } from '@/lib/external-music-info'
import { AmbientHeaderBackground } from '@/components/ambient-header-background'
import { CDSleeveCover } from '@/components/cd-sleeve-cover'
import { CoverImage } from '@/components/cover-image'
import { DetailPinnedToolbar } from '@/components/detail-pinned-toolbar'
import { DetailActionCapsules } from '@/components/detail-action-capsule'
import { Icon, iconSize } from '@/components/icon'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { stackHeaderIconStyle } from '@/components/stack-header-icon-style'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { TrackRow } from '@/components/track-row'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { useLocalFavoritesStore } from '@/lib/local-favorites'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { useExternalSourcesStore } from '@/lib/external-source'
import { externalSourceCacheIdentity } from '@/lib/external-source-cache-key'
import { tap } from '@/lib/haptics'
import { formatAlbumYear, getAlbumAudioSpecBadge } from '@/lib/album-meta'
import { appendTracks, playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { resolveAmbientPalette } from '@/theme/ambient-palette'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

class CatalogTracklistError extends Error {
  constructor(readonly status: string, message: string) {
    super(message)
  }
}

function catalogQuerySourceCurrent(
  page: CatalogPage<CatalogTrack> | undefined,
  active: MusicInfoSourceRef | undefined,
  catalogMode: boolean,
  expected: MusicInfoSourceRef | undefined,
): boolean {
  if (!page || page.status !== 'ok' || !active) return false
  const source = page.source
  if (catalogMode && (!expected || expected.instanceId !== active.instanceId || expected.serviceId !== active.serviceId || expected.type !== active.type)) return false
  return source.instanceId === active.instanceId && source.serviceId === active.serviceId && source.type === active.type
}

function catalogEditionMatches(localName: string, edition?: string): boolean {
  const normalized = normalizeName(edition ?? '')
  if (!normalized || ['专辑', 'album', 'studio', '录音室', '录音室版', 'ep', 'single'].includes(normalized)) return true
  return normalizeName(localName).includes(normalized)
}

/**
 * 专辑详情页 (AlbumDetailScreen):
 * - 沉浸式流体背景：提取封面主导氛围光，经由高斯模糊在头部上方弥散，无缝汇入纯黑深底；
 * - 3D 悬浮实体封面：220pt 封套封面、自适应环境光投影与下拉阻尼弹性放大（Pull-to-Zoom）；
 * - 居中对称排版（8pt 系统）：纯白 H1 标题、浅灰可点击跳转歌手链接、中性灰元数据档案；
 * - 极简音质线框徽章：移除突兀彩色大底块，回归单色半透明超细线框药丸；
 * - 高对比主次按键胶囊：纯白实体播放（黑字）与磨砂玻璃随机播放（白字），校准品牌色滥用；
 * - 滚动吸顶联动：向上越过巨幕后，导航栏平滑过渡为毛玻璃并显现迷你唱片与随手切歌按键；
 * - 列表工具栏：集成「共 x 首 · 可播 xx 分钟」动态时长与 44pt 触控热区的批量多选与排序。
 */
export function AlbumDetailScreen() {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const topHeaderOffset = Math.max(insets.top, 20) + 44
  const params = useLocalSearchParams<{
    id: string
    localId?: string
    catalogSource?: string
    catalogService?: string
    catalogInstance?: string
    catalogId?: string
    catalogArtist?: string
    catalogAlbum?: string
    catalogCover?: string
    catalogLocalArtist?: string
    catalogYear?: string
    catalogEdition?: string
  }>()
  const rawParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
  const routeId = rawParam(params.id) ?? ''
  const explicitLocalId = rawParam(params.localId)
  const routeLocalAlbumId = explicitLocalId && explicitLocalId !== 'catalog'
    ? explicitLocalId
    : (routeId && routeId !== 'catalog' ? routeId : undefined)
  const catalogId = rawParam(params.catalogId)
  const catalogArtist = rawParam(params.catalogArtist) ?? ''
  const catalogAlbum = rawParam(params.catalogAlbum) ?? ''
  const catalogCover = rawParam(params.catalogCover)
  const catalogLocalArtistId = rawParam(params.catalogLocalArtist)
  const catalogYearText = rawParam(params.catalogYear)
  const catalogYear = catalogYearText && /^\d{4}$/.test(catalogYearText) ? Number(catalogYearText) : undefined
  const catalogEdition = rawParam(params.catalogEdition)
  const catalogType = rawParam(params.catalogSource)
  const catalogService = rawParam(params.catalogService)
  const catalogInstance = rawParam(params.catalogInstance)
  const catalogSource: MusicInfoSourceRef | undefined =
    catalogId && catalogService && catalogInstance && (catalogType === 'netease' || catalogType === 'qq' || catalogType === 'lrcapi')
      ? { type: catalogType, serviceId: catalogService, instanceId: catalogInstance }
      : undefined
  const { provider, connection } = useServerSession()
  const openedServerId = useRef(connection?.id)
  const [serverChanged, setServerChanged] = useState(false)
  useEffect(() => {
    if (!connection?.id) return
    if (!openedServerId.current) openedServerId.current = connection.id
    else if (openedServerId.current !== connection.id) setServerChanged(true)
  }, [connection?.id])
  const serverIdentityValid = !serverChanged
  const sourceRevision = useExternalSourcesStore((state) => state.revision)
  const sourceServices = useExternalSourcesStore((state) => state.services)
  const sourceIdentity = externalSourceCacheIdentity(sourceServices)
  const activeSource = getMusicInfoSourceRef()
  const catalogMode = Boolean(catalogId && catalogSource)
  const catalogSourceIsCurrent = Boolean(catalogSource && activeSource &&
    catalogSource.type === activeSource.type && catalogSource.serviceId === activeSource.serviceId && catalogSource.instanceId === activeSource.instanceId)
  const router = useRouter()
  const href = useDetailHref()
  const toast = useToast()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()

  const {
    query: artistInventoryQuery,
    items: artistInventory,
  } = usePagedQuery<Album>({
    queryKey: ['album-detail-artist-inventory', connection?.id, catalogLocalArtistId, 100],
    enabled: Boolean(provider && serverIdentityValid && catalogMode && catalogLocalArtistId && !routeLocalAlbumId),
    fetchPage: (page) => provider!.artistAlbums(catalogLocalArtistId!, { page, size: 100 }),
  })
  const { hasNextPage: inventoryHasNext, isFetchingNextPage: inventoryFetchingNext, isFetchNextPageError: inventoryNextError, fetchNextPage: fetchInventoryNext } = artistInventoryQuery
  useEffect(() => {
    if (serverIdentityValid && catalogMode && !routeLocalAlbumId && catalogLocalArtistId && inventoryHasNext && !inventoryFetchingNext && !inventoryNextError) {
      void fetchInventoryNext()
    }
  }, [serverIdentityValid, catalogMode, routeLocalAlbumId, catalogLocalArtistId, inventoryHasNext, inventoryFetchingNext, inventoryNextError, fetchInventoryNext])
  const artistInventoryComplete = serverIdentityValid && (Boolean(routeLocalAlbumId) || !catalogLocalArtistId || Boolean(
    artistInventoryQuery.isSuccess && !artistInventoryQuery.hasNextPage && !artistInventoryQuery.isFetchingNextPage && !artistInventoryQuery.isPlaceholderData,
  ))
  const artistAlbumMatches = !routeLocalAlbumId && catalogLocalArtistId && artistInventoryComplete
    ? artistInventory.filter((item) => {
          if (normalizeName(item.name) !== normalizeName(catalogAlbum)) return false
          if (catalogYear && (!item.releaseDate || Number(item.releaseDate.slice(0, 4)) !== catalogYear)) return false
          if (!item.artists.some((artist) => normalizeName(artist.name) === normalizeName(catalogArtist))) return false
          return catalogEditionMatches(item.name, catalogEdition)
        })
    : []
  const artistAlbumMatchAmbiguous = artistAlbumMatches.length > 1
  const resolvedArtistAlbum = artistAlbumMatches.length === 1 ? artistAlbumMatches[0] : undefined
  const localAlbumId = routeLocalAlbumId ?? resolvedArtistAlbum?.id

  // 吸顶折叠高度计算
  const [headerHeight, setHeaderHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  const [pinned, setPinned] = useState(false)
  const pinAt = Math.max(0, headerHeight - barHeight)
  useFocusEffect(useCallback(() => {
    const entry = StatusBar.pushStackEntry({ barStyle: mode === 'dark' ? 'light-content' : 'dark-content' })
    return () => StatusBar.popStackEntry(entry)
  }, [mode]))

  const albumQuery = useQuery({
    queryKey: ['album', connection?.id, localAlbumId],
    enabled: Boolean(provider && serverIdentityValid && localAlbumId),
    queryFn: () => provider!.album(localAlbumId!),
  })

  const { selection, setSelection, sortKey, sort } = useListSort('albumTracks')
  const [selecting, setSelecting] = useState(false)
  const routeAlbum = albumQuery.data
  const catalogAlbumIdentityMatches = !catalogId || Boolean(routeAlbum &&
    normalizeName(routeAlbum.name) === normalizeName(catalogAlbum) &&
    routeAlbum.artists.some((artist) => normalizeName(artist.name) === normalizeName(catalogArtist)) &&
    (!catalogYear || Boolean(routeAlbum.releaseDate && Number(routeAlbum.releaseDate.slice(0, 4)) === catalogYear)) &&
    catalogEditionMatches(routeAlbum.name, catalogEdition))
  const localAlbumConfirmed = Boolean(serverIdentityValid && localAlbumId && routeAlbum && catalogAlbumIdentityMatches)
  const { query, items: loadedItems, total: localTotal, loadMore } = usePagedQuery<Track>({
    queryKey: ['album-tracks', connection?.id, localAlbumId, sortKey],
    enabled: Boolean(provider && serverIdentityValid && localAlbumId && routeAlbum && catalogAlbumIdentityMatches),
    fetchPage: (page) => provider!.albumTracks(localAlbumId!, { page, size: 100, sort }),
  })

  const { hasNextPage: tracksHasNext, isFetchingNextPage: tracksFetchingNext, isFetchNextPageError: tracksNextError, fetchNextPage: fetchTracksNext } = query
  useEffect(() => {
    if (serverIdentityValid && catalogMode && localAlbumConfirmed && tracksHasNext && !tracksFetchingNext && !tracksNextError) {
      void fetchTracksNext()
    }
  }, [serverIdentityValid, catalogMode, localAlbumConfirmed, tracksHasNext, tracksFetchingNext, tracksNextError, fetchTracksNext])
  const localTracksComplete = serverIdentityValid && !query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError && !query.isError && !query.isPlaceholderData &&
    (!localAlbumId || query.isSuccess) && artistInventoryComplete
  const items = useMemo(() => localAlbumConfirmed && !query.isPlaceholderData ? loadedItems : [], [localAlbumConfirmed, query.isPlaceholderData, loadedItems])
  const total = localAlbumConfirmed ? localTotal : 0

  const album: Album | undefined = localAlbumConfirmed ? routeAlbum : (catalogId ? {
    id: localAlbumId ?? 'catalog',
    name: catalogAlbum || '外部专辑',
    ...(catalogYear ? { releaseDate: `${catalogYear}-01-01` } : {}),
    artists: [{ id: '', name: catalogArtist || '未知艺术家' }],
  } : undefined)

  // 专属流体氛围调色板
  const palette = resolveAmbientPalette(album?.id ?? album?.coverId)

  // 滚动动效与下拉阻尼缩放（Pull-to-Zoom）
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
  const ambientScrollStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -scrollY.value }] }))

  const artistText = album?.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'
  const firstArtistId = album?.artists[0]?.id
  const artistDetailId = firstArtistId || catalogLocalArtistId
  const canonicalQuery = useQuery<CatalogPage<CatalogTrack>>({
    queryKey: ['canonical-album-tracks', connection?.id, localAlbumId, sourceRevision, sourceIdentity, catalogSource?.instanceId, catalogId, album?.name, artistText],
    enabled: Boolean(album?.name && (catalogMode || (localAlbumConfirmed && activeSource))),
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
    queryFn: async () => {
      const page = await fetchCanonicalAlbumTracks(
        catalogArtist || artistText,
        catalogAlbum || album?.name || '',
        catalogMode ? catalogId : undefined,
        catalogMode ? catalogSource : undefined,
      )
      if (page.status !== 'ok' && page.status !== 'empty') {
        throw new CatalogTracklistError(page.status, page.message ?? '暂时无法获取外部曲目表')
      }
      return page
    },
  })
  const canonicalPageIsCurrent = Boolean(catalogQuerySourceCurrent(canonicalQuery.data, activeSource, catalogMode, catalogSource))
  const canonicalPage = canonicalQuery.data?.status === 'ok' && canonicalPageIsCurrent ? canonicalQuery.data : undefined
  const canonicalItems = useMemo(() => (canonicalPage?.items ?? [])
    .map((track, originalIndex) => ({ track, originalIndex }))
    .sort((a, b) => {
      const discDifference = (a.track.discNo ?? 1) - (b.track.discNo ?? 1)
      if (discDifference) return discDifference
      const trackDifference = (a.track.trackNo ?? a.originalIndex + 1) - (b.track.trackNo ?? b.originalIndex + 1)
      return trackDifference || a.originalIndex - b.originalIndex
    })
    .map(({ track }) => track), [canonicalPage])
  const localComparisonAvailable = localAlbumConfirmed || Boolean(catalogLocalArtistId && artistInventoryComplete && !artistAlbumMatchAmbiguous)
  const completeness = useMemo(() => {
    if (!canonicalItems.length || !localTracksComplete || !localComparisonAvailable) return null
    return computeAlbumCompleteness(items, canonicalItems)
  }, [canonicalItems, items, localTracksComplete, localComparisonAvailable])
  const queueTracks = useMemo(() => completeness
    ? [...completeness.entries.flatMap((entry) => entry.status === 'inLibrary' && entry.local ? [entry.local] : []), ...completeness.extraLocal, ...completeness.ambiguousLocal]
    : items, [completeness, items])
  const specBadge = useMemo(() => getAlbumAudioSpecBadge(queueTracks), [queueTracks])
  const formattedYear = useMemo(() => formatAlbumYear(album?.releaseDate), [album?.releaseDate])
  const totalDurationMs = useMemo(
    () => queueTracks.reduce((acc, track) => acc + (track.durationMs || 0), 0),
    [queueTracks],
  )
  const gapHint = useMemo(() => (completeness ? [] : inferTrackGaps(items)), [completeness, items])
  const catalogEntries = canonicalItems.map((track, index) => ({
    track,
    entry: completeness?.entries[index],
    status: completeness?.entries[index]?.status ?? 'unknown' as const,
  }))
  type DisplayRow =
    | { kind: 'canonical'; key: string; track: CatalogTrack; index: number; status: 'inLibrary' | 'missing' | 'ambiguous' | 'unknown'; local?: Track }
    | { kind: 'local'; key: string; track: Track; index: number; ambiguous?: boolean }
  const displayRows: DisplayRow[] = canonicalPage
    ? [
        ...catalogEntries.map(({ track, entry, status }, index) => ({
          kind: 'canonical' as const,
          key: `canonical-${track.discNo ?? 1}-${track.trackNo ?? index + 1}-${track.externalId ?? track.title}`,
          track,
          index,
          status: status as 'inLibrary' | 'missing' | 'ambiguous' | 'unknown',
          ...(entry?.local ? { local: entry.local } : {}),
        })),
        ...(!completeness ? items.map((track, index) => ({ kind: 'local' as const, key: `local-${track.id}`, track, index: canonicalItems.length + index })) : []),
        ...(completeness?.extraLocal ?? []).map((track, index) => ({ kind: 'local' as const, key: `extra-${track.id}`, track, index: canonicalItems.length + index })),
        ...(completeness?.ambiguousLocal ?? []).map((track, index) => ({ kind: 'local' as const, key: `ambiguous-local-${track.id}`, track, index: canonicalItems.length + (completeness?.extraLocal.length ?? 0) + index, ambiguous: true })),
      ]
    : items.map((track, index) => ({ kind: 'local' as const, key: `local-${track.id}`, track, index }))
  const toolbarSummary = completeness
    ? `共 ${completeness.total} 首${completeness.owned < completeness.total ? ` · 已入库 ${completeness.owned} 首` : ''}`
    : canonicalPage
      ? `共 ${canonicalItems.length} 首 · 正在核对入库情况`
      : undefined
  const toolbarTotal = completeness?.total ?? (canonicalPage ? canonicalItems.length : total)
  const toolbarDuration = canonicalPage
    ? completeness && queueTracks.length > 0 ? totalDurationMs : undefined
    : totalDurationMs
  const toolbarActionsVisible = localAlbumConfirmed && queueTracks.length > 0

  // These are album-level explanations, not fatal dialogs. Show only the highest-priority
  // one so a transient fetch error cannot stack with a matching hint above the track list.
  const catalogNotice: { title: string; detail: string; actionLabel?: string; onAction?: () => void } | undefined = (() => {
    const artistAction = catalogLocalArtistId
      ? { actionLabel: '查看艺术家', onAction: () => router.push(href.artist(catalogLocalArtistId)) }
      : {}
    const sourceAction = { actionLabel: '信息源设置', onAction: () => router.push('/(tabs)/settings/external-sources' as const) }

    if (catalogMode && catalogLocalArtistId && !artistInventoryComplete) {
      return artistInventoryQuery.isError
        ? { title: '本地曲库核对失败', detail: '无法判断哪些歌曲已入库，仍可查看外部曲目。', actionLabel: '重试', onAction: () => void artistInventoryQuery.refetch() }
        : { title: '正在核对本地曲库', detail: '曲目列表可先浏览，入库状态稍后更新。' }
    }
    if (catalogMode && artistAlbumMatchAmbiguous) {
      return { title: '找到多个同名本地专辑', detail: '暂时无法确定对应版本。请在艺术家页面核对年份和版本。', ...artistAction }
    }
    if (catalogId && !catalogSource) {
      return { title: '信息源已不可用', detail: '当前仅显示专辑信息。请重新选择音乐信息源。', ...sourceAction }
    }
    if (catalogMode && !catalogSourceIsCurrent) {
      return { title: '信息源已更换', detail: '这张专辑属于先前的信息源，请从艺术家页面重新打开。', ...artistAction }
    }
    if (canonicalQuery.isError) {
      if (canonicalQuery.error instanceof CatalogTracklistError && canonicalQuery.error.status === 'ambiguous') {
        return { title: '找到多个同名外部专辑', detail: '无法安全选择曲目表。请从艺术家专辑列表打开具体版本。', ...artistAction }
      }
      if (canonicalQuery.error instanceof CatalogTracklistError && canonicalQuery.error.status === 'unsupported') {
        return { title: '当前信息源不提供曲目表', detail: '可在设置中选择支持专辑曲目目录的信息源。', ...sourceAction }
      }
      return { title: '曲目表暂时无法获取', detail: '可能是网络波动或信息源暂不可用，本地歌曲仍可播放。', actionLabel: '重试', onAction: () => void canonicalQuery.refetch() }
    }
    if (canonicalQuery.data?.status === 'empty') {
      return { title: '信息源未提供曲目表', detail: '无法判断哪些歌曲缺失。可重新获取，或尝试其他音乐信息源。', actionLabel: '重新获取', onAction: () => void canonicalQuery.refetch() }
    }
    if (localAlbumId && albumQuery.isError && catalogId) {
      return { title: '本地专辑暂不可用', detail: '播放入口已暂时隐藏，外部专辑信息仍可浏览。', actionLabel: '重试', onAction: () => void albumQuery.refetch() }
    }
    if (catalogMode && !catalogLocalArtistId && !localAlbumConfirmed) {
      return { title: '无法核对本地曲库', detail: '未能关联本地艺术家；这些外部曲目不会被误判为未入库。' }
    }
    if (completeness?.ambiguous) {
      return { title: `${completeness.ambiguous} 首歌曲待核对`, detail: '同名歌曲的曲目号或碟号不一致，暂不能确定是否已入库。请核对本地专辑的曲目信息。' }
    }
    return undefined
  })()

  async function play(startIndex: number, shuffle = false, tracks: Track[] = queueTracks) {
    if (!provider || !connection || tracks.length === 0 || !localAlbumConfirmed || !localAlbumId) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks,
      startIndex,
      source: { kind: 'album', id: localAlbumId, label: album?.name ? `专辑 · ${album.name}` : '专辑' },
    })
    if (shuffle) await toggleShuffle()
  }

  const handleAppendToQueue = async () => {
    if (!provider || !connection || queueTracks.length === 0 || !localAlbumConfirmed) {
      toast('专辑没有已入库歌曲可添加')
      return
    }
    try {
      await appendTracks({ provider, serverId: connection.id, tracks: queueTracks })
      toast(`已添加 ${queueTracks.length} 首歌曲到队列`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败')
    }
  }

  const handleGotoArtist = () => {
    if (artistDetailId) router.push(href.artist(artistDetailId))
  }

  const menuActions: MenuAction[] = useMemo(() => {
    const actions: MenuAction[] = []
    if (localAlbumConfirmed && queueTracks.length > 0) {
      actions.push({ id: 'append-to-queue', title: '添加到当前播放队列', image: Platform.OS === 'ios' ? 'text.append' : undefined, imageColor: colors.iconBright })
    }
    if (firstArtistId) actions.push({ id: 'goto-artist', title: '查看艺术家', image: Platform.OS === 'ios' ? 'person.crop.circle' : undefined, imageColor: colors.iconBright })
    return actions
  }, [localAlbumConfirmed, queueTracks.length, firstArtistId, colors.iconBright])

  const handleMenuAction = ({ nativeEvent }: NativeActionEvent) => {
    if (nativeEvent.event === 'append-to-queue') void handleAppendToQueue()
    if (nativeEvent.event === 'goto-artist') handleGotoArtist()
  }

  const isMenuOpen = useIsMenuOpen()

  const isFavorited = useLocalFavoritesStore((s) => (connection && localAlbumId && localAlbumConfirmed ? s.isAlbumFavorited(connection.id, localAlbumId) : false))
  const toggleAlbumFavorite = useLocalFavoritesStore((s) => s.toggleAlbum)

  const handleToggleFavorite = () => {
    if (!connection || !album || !localAlbumConfirmed || !localAlbumId) return
    tap()
    const added = toggleAlbumFavorite(connection.id, {
      id: localAlbumId,
      name: album.name,
      coverId: album.coverId,
      artistName: album.artists[0]?.name,
      trackCount: album.trackCount,
    })
    toast(added ? '已收藏专辑' : '已取消收藏')
  }

  if (routeLocalAlbumId && albumQuery.isPending) return <LoadingState />
  if (localAlbumId && albumQuery.isLoadingError && !catalogId) return <ErrorState error={albumQuery.error} onRetry={() => void albumQuery.refetch()} />
  if (!album) return <EmptyState text={serverIdentityValid ? '专辑不存在' : '本地服务器已切换，请从新服务器重新打开专辑'} />

  const toolbar = (
    <ListToolbar
      kind="albumTracks"
      total={toolbarTotal}
      totalDurationMs={toolbarDuration}
      countLabel={toolbarSummary}
      showActions={toolbarActionsVisible}
      selection={selection}
      onSelect={setSelection}
      onStartSelection={toolbarActionsVisible ? () => setSelecting(true) : undefined}
    />
  )

  return (
    <View style={styles.root}>
      {/* 顶部自适应毛玻璃导航栏 */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          statusBarStyle: mode === 'dark' ? 'light' : 'dark',
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
              <CoverImage
                coverId={album.coverId}
                resource={catalogCover ? { url: catalogCover, headers: {} } : undefined}
                size={28}
                borderRadius={4}
              />
              <Text style={styles.navTitleText} numberOfLines={1}>
                {album.name}
              </Text>
            </Animated.View>
          ),
          headerRight: () => menuActions.length > 0 || (pinned && queueTracks.length > 0 && localAlbumConfirmed) ? (
            <View style={styles.navRightRow}>
              {pinned && queueTracks.length > 0 && localAlbumConfirmed ? (
                <Pressable
                  hitSlop={12}
                  style={({ pressed }) => stackHeaderIconStyle(pressed, colors.bgListItemHover)}
                  onPress={() => {
                    tap()
                    void play(0)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部"
                >
                  <Icon name="play" size={18} color={colors.textPrimary} filled />
                </Pressable>
              ) : null}
              {menuActions.length > 0 ? (
                <MenuView
                  title={album.name}
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
                    accessibilityLabel="专辑菜单"
                  >
                    <Icon name="more" size={iconSize.xl} color={colors.textPrimary} />
                  </Pressable>
                </MenuView>
              ) : null}
            </View>
          ) : null,
        }}
      />

      {/* Keep the first frame under the status bar; then move the ambience with the scrolling header. */}
      <Animated.View pointerEvents="none" style={[styles.ambientScrollContainer, ambientScrollStyle]}>
        <AmbientHeaderBackground palette={palette} coverId={album.coverId} coverUrl={catalogCover} />
      </Animated.View>
      {mode === 'light' ? (
        <LinearGradient
          colors={[`${colors.bgPrimary}E8`, `${colors.bgPrimary}B8`, `${colors.bgPrimary}00`]}
          locations={[0, 0.55, 1]}
          pointerEvents="none"
          style={[styles.statusBarContrast, { height: insets.top + 46 }]}
        />
      ) : null}

      <Animated.FlatList
        data={displayRows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[
          styles.list,
          { paddingTop: topHeaderOffset + 16, paddingBottom: bottom },
        ]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        ListHeaderComponent={
          <View style={styles.headerRoot} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            {/* 上下居中排版：从上到下为 CD 盒大封套、专辑大标题、艺人、年份与音质标签 */}
            <View style={styles.coverBlock}>
              {/* 1. CD 实体大封套，带微透高光与环境光深邃投影 */}
              <Animated.View style={[styles.coverContainer, coverAnimatedStyle]}>
                <View style={[styles.coverGlow, { shadowColor: palette.primary }]}>
                  <CDSleeveCover coverId={album.coverId} coverUrl={catalogCover} width={260} />
                </View>
              </Animated.View>

              {/* 2. 专辑大标题（居中纯白加粗） */}
              <Text style={styles.name} numberOfLines={2}>
                {album.name}
              </Text>

              {/* 3. 艺人：本地与外部专辑共用同一行布局 */}
              <Pressable
                onPress={artistDetailId ? handleGotoArtist : undefined}
                disabled={!artistDetailId}
                hitSlop={8}
                style={({ pressed }) => [styles.artistLink, pressed && styles.artistLinkPressed]}
                accessibilityRole={artistDetailId ? 'link' : 'text'}
                accessibilityLabel={artistDetailId ? `查看艺术家 ${artistText}` : artistText}
              >
                <Text style={styles.artistText} numberOfLines={1}>
                  {artistText}
                </Text>
                {artistDetailId ? (
                  <View style={styles.artistChevron}>
                    <Icon name="chevronRight" size={13} color={colors.textTertiary} />
                  </View>
                ) : null}
              </Pressable>

              {/* 4. 年份与音频规格使用同一标签语言 */}
              {formattedYear || specBadge ? (
                <View style={styles.metaRow}>
                  {formattedYear ? (
                    <View style={styles.specBadge} accessible accessibilityLabel={`发行年份 ${formattedYear}`}>
                      <Text style={styles.specBadgeText}>{formattedYear}</Text>
                    </View>
                  ) : null}
                  {specBadge ? (
                    <View style={styles.specBadge} accessible accessibilityLabel={`音频规格 ${specBadge}`}>
                      <Text style={styles.specBadgeText}>{specBadge}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {queueTracks.length > 0 && localAlbumConfirmed ? (
                <View style={styles.actions}>
                  <DetailActionCapsules
                    onPlay={() => { tap(); void play(0) }}
                    onToggleFavorite={handleToggleFavorite}
                    favorite={isFavorited}
                    playLabel={completeness && completeness.owned < completeness.total ? '播放已入库' : '播放全部'}
                  />
                </View>
              ) : null}
              {catalogNotice ? (
                <View style={styles.catalogNoticeCard} accessibilityLiveRegion="polite">
                  <Icon name="info" size={19} color={colors.textSecondary} />
                  <View style={styles.catalogNoticeCopy}>
                    <Text style={styles.catalogNoticeTitle}>{catalogNotice.title}</Text>
                    <Text style={styles.catalogNoticeDetail}>{catalogNotice.detail}</Text>
                  </View>
                  {catalogNotice.onAction && catalogNotice.actionLabel ? (
                    <Pressable
                      onPress={catalogNotice.onAction}
                      style={styles.catalogNoticeAction}
                      accessibilityRole="button"
                      accessibilityLabel={catalogNotice.actionLabel}
                    >
                      <Text style={styles.catalogNoticeActionText}>{catalogNotice.actionLabel}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* 列表工具栏（排序与批量多选入口） */}
            {canonicalPage || (queueTracks.length > 0 && localAlbumConfirmed) ? (
              <View style={styles.toolbarSlot} onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}>
                {toolbar}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'local') {
            const queueIndex = queueTracks.findIndex((track) => track.id === item.track.id)
            if (item.ambiguous) {
              return (
                <TrackRow
                  track={item.track}
                  index={item.index}
                  leading="index"
                  statusLabel="待核对"
                  playing={current?.serverId === connection?.id && current?.trackId === item.track.id}
                  onPress={queueIndex >= 0 ? () => void play(queueIndex) : undefined}
                />
              )
            }
            return (
              <TrackRow
                track={item.track}
                index={item.index}
                leading="index"
                playing={current?.serverId === connection?.id && current?.trackId === item.track.id}
                onPress={queueIndex >= 0 ? () => void play(queueIndex) : undefined}
              />
            )
          }
          if (item.status === 'inLibrary' && item.local) {
            const queueIndex = queueTracks.findIndex((track) => track.id === item.local!.id)
            return (
              <TrackRow
                track={item.local}
                index={item.index}
                leading="index"
                playing={current?.serverId === connection?.id && current?.trackId === item.local.id}
                onPress={queueIndex >= 0 ? () => void play(queueIndex) : undefined}
              />
            )
          }
          return (
            <TrackRow
              display={{ title: item.track.title, subtitle: catalogArtist || artistText }}
              index={item.index}
              leading="index"
              disabled
              statusLabel={item.status === 'missing' ? '未入库' : '待核对'}
            />
          )
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          <>
            {gapHint.length > 0 && !catalogMode ? (
              <View style={styles.completeBlock}>
                <Text style={styles.gapHint}>
                  可能缺 {gapHint.length} 首（曲目号 {gapHint.join('、')}）· 配置音乐信息源可看缺失曲名
                </Text>
              </View>
            ) : null}
            <PaginationFooter
              loading={query.isFetchingNextPage}
              error={query.isFetchNextPageError ? query.error : undefined}
              onRetry={() => void query.fetchNextPage()}
            />
          </>
        }
      />

      {/* 滚动过头部后吸附顶部的精简工具条 */}
      {pinned && queueTracks.length > 0 && localAlbumConfirmed ? (
        <DetailPinnedToolbar top={topHeaderOffset}>
          {toolbar}
        </DetailPinnedToolbar>
      ) : null}

      {/* 批量操作模态弹窗（同步切为 leading="index"） */}
      {localAlbumId && localAlbumConfirmed && queueTracks.length > 0 ? <TrackSelectionModal
        visible={selecting}
        items={queueTracks}
        source={{ kind: 'album', id: localAlbumId, label: album?.name ? `专辑 · ${album.name}` : '专辑' }}
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
      /> : null}

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
    backgroundColor: colors.bgPrimary,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  headerRoot: {
    marginBottom: 0,
  },
  ambientScrollContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 480,
  },
  statusBarContrast: { position: 'absolute', top: 0, left: 0, right: 0 },
  coverBlock: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  coverContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverGlow: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  name: {
    ...typography.title,
    fontSize: 22,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 28,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: spacing.md,
  },
  artistLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginTop: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    maxWidth: '90%',
  },
  artistLinkPressed: {
    opacity: 0.7,
  },
  artistText: {
    ...typography.subhead,
    fontSize: 15,
    fontFamily: fonts.medium,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    flexShrink: 1,
  },
  artistChevron: {
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  specBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.badgeBorder,
    backgroundColor: colors.badgeBg,
  },
  specBadgeText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.badgeText,
    letterSpacing: 0.4,
  },
  actions: {
    marginTop: 18,
    width: '100%',
  },
  catalogNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgButtonSecondary,
  },
  catalogNoticeCopy: { flex: 1, gap: 2 },
  catalogNoticeTitle: { ...typography.footnote, color: colors.textPrimary, fontFamily: fonts.semibold, fontWeight: '600' },
  catalogNoticeDetail: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  catalogNoticeAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  catalogNoticeActionText: { ...typography.footnote, color: colors.actionText, fontFamily: fonts.semibold, fontWeight: '600' },
  actionButton: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
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
    marginLeft: 48,
    backgroundColor: colors.borderSubtle,
  },
  completeBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  completeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  completeToggle: { ...typography.footnote, color: colors.actionText },
  gapHint: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
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
