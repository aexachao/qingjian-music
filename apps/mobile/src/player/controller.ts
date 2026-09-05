import TrackPlayer, { RepeatMode as RntpRepeatMode, type AddTrack } from 'react-native-track-player'
import type { PlaySource, QueueItem, RepeatMode, Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import { cacheArtwork } from './artwork'
import { type AudioCacheTarget, cacheAudio, cachedAudioUri, protectTracks } from './audio-cache'
import { contentTypeFor } from './audio-cache-policy'
import { ensurePlayer } from './setup'
import { usePlayerStore } from './store'

const ARTWORK_SIZE = 600
/** 预取范围：当前这首 + 后面两首 */
const PREFETCH_AHEAD = 2

/** 领域曲目 → 队列元素（带鉴权头的封面地址一并算好，锁屏/车机直接用） */
export function toQueueItem(track: Track, provider: MusicProvider, serverId: string): QueueItem {
  const artwork = track.coverId ?? track.album?.coverId
  return {
    qid: `${serverId}:${track.id}`,
    serverId,
    trackId: track.id,
    title: track.title,
    artistText: track.artists.map((artist) => artist.name).join(' / ') || '未知艺术家',
    ...(track.album?.name ? { albumText: track.album.name } : {}),
    ...(track.album?.id ? { albumId: track.album.id } : {}),
    ...(track.artists[0]?.id ? { artistId: track.artists[0].id } : {}),
    ...(track.isFavorite === undefined ? {} : { isFavorite: track.isFavorite }),
    ...(track.audio?.format ? { format: track.audio.format } : {}),
    ...(track.audio?.sizeBytes ? { sizeBytes: track.audio.sizeBytes } : {}),
    durationMs: track.durationMs,
    ...(artwork ? { artwork: provider.image(artwork, ARTWORK_SIZE) } : {}),
  }
}

function toCacheTarget(item: QueueItem): AudioCacheTarget {
  return {
    serverId: item.serverId,
    trackId: item.trackId,
    ...(item.format ? { format: item.format } : {}),
    ...(item.sizeBytes ? { sizeBytes: item.sizeBytes } : {}),
  }
}

/**
 * 队列元素 → RNTP 曲目。命中播放缓存就直接放本地文件（不需要鉴权头），
 * 否则回落到网络地址 + 鉴权头，同时由 schedulePrefetch 在后台补缓存。
 */
async function toRntpTrack(item: QueueItem, provider: MusicProvider): Promise<AddTrack> {
  const base = {
    id: item.qid,
    title: item.title,
    artist: item.artistText,
    ...(item.albumText ? { album: item.albumText } : {}),
    duration: item.durationMs / 1000,
  }
  const cached = cachedAudioUri(toCacheTarget(item))
  if (cached) {
    const contentType = contentTypeFor(item.format)
    return { ...base, url: cached, ...(contentType ? { contentType } : {}) }
  }
  const stream = await provider.stream(item.trackId, { quality: 'original', allowTranscode: false })
  return {
    ...base,
    url: stream.url,
    headers: stream.headers,
    ...(stream.mimeHint ? { contentType: stream.mimeHint } : {}),
  }
}

export interface PlayListInput {
  provider: MusicProvider
  serverId: string
  tracks: Track[]
  startIndex: number
  source: PlaySource
}

/** 从一个列表开始播放（专辑、艺术家、搜索结果都走这里） */
export async function playTrackList({ provider, serverId, tracks, startIndex, source }: PlayListInput): Promise<void> {
  if (tracks.length === 0) return
  await ensurePlayer()

  const items = tracks.map((track) => toQueueItem(track, provider, serverId))
  const rntpTracks = await Promise.all(items.map((item) => toRntpTrack(item, provider)))

  await TrackPlayer.reset()
  await TrackPlayer.add(rntpTracks)
  const safeIndex = Math.min(Math.max(startIndex, 0), items.length - 1)
  if (safeIndex > 0) await TrackPlayer.skip(safeIndex)
  usePlayerStore.getState().setQueue(items, safeIndex, source)
  await TrackPlayer.play()
  void refreshArtwork(safeIndex)
  schedulePrefetch(safeIndex)
}

/** 把当前曲目的封面下载到本地并回填锁屏元数据 */
export async function refreshArtwork(index: number): Promise<void> {
  const item = usePlayerStore.getState().queue[index]
  if (!item?.artwork) return
  const uri = await cacheArtwork(item.qid, item.artwork)
  if (!uri) return
  try {
    await TrackPlayer.updateMetadataForTrack(index, {
      title: item.title,
      artist: item.artistText,
      ...(item.albumText ? { album: item.albumText } : {}),
      artwork: uri,
      duration: item.durationMs / 1000,
    })
  } catch {
    // 队列已变化时忽略
  }
}

export async function togglePlay(): Promise<void> {
  await ensurePlayer()
  const state = await TrackPlayer.getPlaybackState()
  if (state.state === 'playing') await TrackPlayer.pause()
  else await TrackPlayer.play()
}

/** 3 秒内按上一首视作「回到上一首」，否则回到本曲开头（对齐 Apple Music） */
export async function skipToPreviousSmart(): Promise<void> {
  await ensurePlayer()
  const progress = await TrackPlayer.getProgress()
  if (progress.position > 3) {
    await TrackPlayer.seekTo(0)
    return
  }
  try {
    await TrackPlayer.skipToPrevious()
  } catch {
    await TrackPlayer.seekTo(0)
  }
}

export async function skipToNextSafe(): Promise<void> {
  try {
    await TrackPlayer.skipToNext()
  } catch {
    // 已经是最后一首
  }
}

/** 队列页点某一行：直接跳到该曲目并播放 */
export async function skipToIndex(index: number): Promise<void> {
  await ensurePlayer()
  try {
    await TrackPlayer.skip(index)
    await TrackPlayer.play()
  } catch {
    // 下标越界（队列刚被改过）时忽略
  }
}

/** 队列页拖动排序：先改播放器队列，再同步本地展示顺序 */
export async function moveInQueue(from: number, to: number): Promise<void> {
  if (from === to) return
  await ensurePlayer()
  try {
    await TrackPlayer.move(from, to)
  } catch {
    return
  }
  usePlayerStore.getState().moveItem(from, to)
}

/** 队列页删除一首；当前播放那首不允许删（避免打断播放） */
export async function removeFromQueue(index: number): Promise<void> {
  const { index: current } = usePlayerStore.getState()
  if (index === current) return
  await ensurePlayer()
  try {
    await TrackPlayer.remove([index])
  } catch {
    return
  }
  usePlayerStore.getState().removeItem(index)
}

/** 清空队列并停止播放 */
export async function clearQueue(): Promise<void> {
  await ensurePlayer()
  await TrackPlayer.reset()
  usePlayerStore.getState().clear()
}

const REPEAT_ORDER: RepeatMode[] = ['off', 'queue', 'one']

export async function cycleRepeat(): Promise<RepeatMode> {
  const current = usePlayerStore.getState().playMode.repeat
  const next = REPEAT_ORDER[(REPEAT_ORDER.indexOf(current) + 1) % REPEAT_ORDER.length]!
  await TrackPlayer.setRepeatMode(
    next === 'one' ? RntpRepeatMode.Track : next === 'queue' ? RntpRepeatMode.Queue : RntpRepeatMode.Off,
  )
  usePlayerStore.getState().setRepeat(next)
  return next
}

/**
 * 随机播放：只重排「当前曲目之后」的部分，当前播放不打断。
 * 关闭随机时无法还原原始顺序（v1 取舍），提示语在设置里说明。
 */
export async function toggleShuffle(): Promise<boolean> {
  const store = usePlayerStore.getState()
  const next = !store.playMode.shuffle
  store.setShuffle(next)
  if (!next) return next

  const { queue, index, source } = usePlayerStore.getState()
  if (index < 0 || queue.length - index < 3) return next

  const head = queue.slice(0, index + 1)
  const tail = queue.slice(index + 1)
  for (let i = tail.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = tail[i]!
    tail[i] = tail[j]!
    tail[j] = a
  }
  const reordered = [...head, ...tail]

  // RNTP 没有「重排队列」API：移除尾部再按新顺序追加
  const removeIndices = Array.from({ length: tail.length }, (_, i) => index + 1 + i)
  await TrackPlayer.remove(removeIndices)
  const provider = activeProvider
  if (provider) {
    const rntpTracks = await Promise.all(tail.map((item) => toRntpTrack(item, provider)))
    await TrackPlayer.add(rntpTracks)
  }
  usePlayerStore.getState().setQueue(reordered, index, source)
  return next
}

/** 随机播放与预取都要用 provider 重新生成播放地址，这里保存最近一次使用的实例 */
let activeProvider: MusicProvider | null = null
/** 每次切歌都会重排预取顺序，旧的循环靠这个令牌自行退出 */
let prefetchToken = 0

export function rememberProvider(provider: MusicProvider | null): void {
  activeProvider = provider
}

/**
 * 把当前这首和后两首放进播放缓存。当前那首本次仍然走网络直连
 * （不等下载完，起播不能变慢），缓存是为了下次听得更快、离线也能听。
 */
export function schedulePrefetch(index: number): void {
  const provider = activeProvider
  if (!provider || index < 0) return
  const { queue } = usePlayerStore.getState()
  const targets = queue.slice(index, index + 1 + PREFETCH_AHEAD)
  if (targets.length === 0) return
  protectTracks(targets.map(toCacheTarget))

  prefetchToken += 1
  const token = prefetchToken
  void (async () => {
    for (const item of targets) {
      if (token !== prefetchToken) return
      const target = toCacheTarget(item)
      if (cachedAudioUri(target)) continue
      try {
        const stream = await provider.stream(item.trackId, { quality: 'original', allowTranscode: false })
        await cacheAudio(target, { url: stream.url, headers: stream.headers })
      } catch {
        // 预取失败不影响播放，下次再试
      }
    }
  })()
}
