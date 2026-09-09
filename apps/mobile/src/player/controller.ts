import TrackPlayer, { RepeatMode as RntpRepeatMode, TrackType, type AddTrack } from 'react-native-track-player'
import type { PlaySource, QueueItem, RepeatMode, Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import { cacheArtwork } from './artwork'
import { type AudioCacheTarget, cacheAudio, cachedAudioUri, protectTracks } from './audio-cache'
import { contentTypeFor } from './audio-cache-policy'
import { needsTranscode } from './format-support'
import { GenerationToken } from './generation-token'
import { clearPlaybackSnapshot, readPlaybackSnapshot } from './persist'
import { QueueOccurrenceIds } from './queue-occurrence'
import { planTailReorder } from './queue-reorder'
import { ensurePlayer } from './setup'
import { AsyncMutationQueue } from './mutation-queue'
import { usePlayerStore } from './store'
import { clearWarmTranscode, setWarmTranscode, takeWarmTranscode } from './transcode-prewarm'
import { hasTranscodeSession, replaceTranscodeSession, startTranscodeSession, stopTranscodeSession } from './transcode-session'

const ARTWORK_SIZE = 600
/** 预取范围：当前这首 + 后面两首 */
const PREFETCH_AHEAD = 2
const queueMutations = new AsyncMutationQueue()
const playbackGeneration = new GenerationToken()

const queueOccurrenceIds = new QueueOccurrenceIds()

function nextQueueId(serverId: string, trackId: string): string {
  return queueOccurrenceIds.create(serverId, trackId)
}

/** 领域曲目 → 队列元素（带鉴权头的封面地址一并算好，锁屏/车机直接用） */
export function toQueueItem(track: Track, provider: MusicProvider, serverId: string): QueueItem {
  const artwork = track.coverId ?? track.album?.coverId
  return {
    qid: nextQueueId(serverId, track.id),
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
    ...(artwork ? { coverId: artwork, artwork: provider.image(artwork, ARTWORK_SIZE) } : {}),
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

/** 原生放不了、或上次原生播放失败过的曲目，必须走服务端转码 */
const forcedTranscode = new Set<string>()

export function shouldTranscode(item: QueueItem): boolean {
  return forcedTranscode.has(item.qid) || needsTranscode(item.format)
}

/** 原生播放报错后调用：这首之后一律走转码 */
export function markForcedTranscode(qid: string): boolean {
  if (forcedTranscode.has(qid)) return false
  forcedTranscode.add(qid)
  return true
}

/**
 * 队列元素 → RNTP 曲目。优先级：
 * 1. allowTranscode 且这首需要转码 → HLS 会话（并登记保活）
 * 2. 命中播放缓存 → 本地文件（不需要鉴权头）
 * 3. 其余 → 网络直推 + 鉴权头，后台由 schedulePrefetch 补缓存
 *
 * 队列里其他需要转码的曲目故意不在这里解析：一次性给整张专辑发转码请求
 * 只会在服务端堆一堆没人听的任务，等它真的切过去再换（ensureTranscodeForIndex）。
 */
async function toRntpTrack(
  item: QueueItem,
  provider: MusicProvider,
  options: { allowTranscode?: boolean } = {},
): Promise<AddTrack> {
  const base = {
    id: item.qid,
    title: item.title,
    artist: item.artistText,
    ...(item.albumText ? { album: item.albumText } : {}),
    duration: item.durationMs / 1000,
  }
  const transcode = Boolean(options.allowTranscode) && shouldTranscode(item)
  if (transcode) {
    const stream = await provider.stream(item.trackId, { quality: 'original', allowTranscode: true })
    if (stream.session) startTranscodeSession(item.qid, stream.session)
    return {
      ...base,
      url: stream.url,
      headers: stream.headers,
      ...(stream.transport === 'hls' ? { type: TrackType.HLS } : {}),
    }
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
async function playTrackListMutation({ provider, serverId, tracks, startIndex, source }: PlayListInput): Promise<void> {
  if (tracks.length === 0) return
  await ensurePlayer()

  const items = tracks.map((track) => toQueueItem(track, provider, serverId))
  const safeStart = Math.min(Math.max(startIndex, 0), items.length - 1)
  const selected = items[safeStart]!
  const orderedItems = [selected, ...items.filter((_, itemIndex) => itemIndex !== safeStart)]
  const rntpTracks = await Promise.all(
    orderedItems.map((item, itemIndex) => toRntpTrack(item, provider, { allowTranscode: itemIndex === 0 })),
  )

  // 换成别的来源就结束漫游会话，否则后面会往专辑队列里塞电台歌
  if (source.kind !== 'radio') resetRadioSession()

  await TrackPlayer.reset()
  await TrackPlayer.add(rntpTracks)
  const safeIndex = 0
  usePlayerStore.getState().setQueue(orderedItems, safeIndex, source)
  await TrackPlayer.play()
  void refreshArtwork(safeIndex)
  schedulePrefetch(safeIndex)
}

export function playTrackList(input: PlayListInput): Promise<void> {
  playbackGeneration.advance()
  return queueMutations.run(() => playTrackListMutation(input))
}

/** 往队尾追加曲目（漫游续歌、以后的「稍后播放」都用它）。追加的都不是当前曲目，所以不开转码 */
async function appendTracksMutation({
  provider,
  serverId,
  tracks,
}: Omit<PlayListInput, 'startIndex' | 'source'>): Promise<void> {
  if (tracks.length === 0) return
  await ensurePlayer()
  const items = tracks.map((track) => toQueueItem(track, provider, serverId))
  const rntpTracks = await Promise.all(items.map((item) => toRntpTrack(item, provider)))
  await TrackPlayer.add(rntpTracks)
  usePlayerStore.getState().appendItems(items)
}

export function appendTracks(input: Omit<PlayListInput, 'startIndex' | 'source'>): Promise<void> {
  return queueMutations.run(() => appendTracksMutation(input))
}

// ---- 漫游电台 ----

/** 漫游游标（飞牛的 roamId），指向队列里最后一首电台曲目 */
let radioCursor: string | undefined
/** 正在补歌，防止同一时刻发多份请求 */
let radioFilling = false
let radioSession = 0

function resetRadioSession(): void {
  radioSession += 1
  radioCursor = undefined
  radioFilling = false
}

/** 平时播放时队尾至少留几首，听着才像无限流 */
export const RADIO_UPCOMING_KEEP = 6
/** 首次进漫游就先把队尾补到这个量（+正在播的这首 ≈ 20 首） */
export const RADIO_ENTRY_UPCOMING = 19

/** 开始漫游：服务端按口味推歌，起播一首后立刻在后台把队尾补到 ~20 首 */
export async function startRadio(provider: MusicProvider, serverId: string): Promise<void> {
  if (!provider.radioStart) return
  playbackGeneration.advance()
  resetRadioSession()
  const generation = playbackGeneration.capture()
  const session = radioSession
  const slice = await provider.radioStart()
  if (!playbackGeneration.isCurrent(generation) || session !== radioSession) return
  await queueMutations.run(() =>
    playTrackListMutation({
      provider,
      serverId,
      tracks: [slice.current],
      startIndex: 0,
      source: { kind: 'radio', label: '漫游' },
    }),
  )
  if (!playbackGeneration.isCurrent(generation) || session !== radioSession) return
  radioCursor = slice.cursor
  // 漫游本身就是无限流：把「无限播放」标成开启，工具栏按钮如实反映。
  usePlayerStore.getState().setAutoplay(true)
  // 不阻塞：第一首先唱着，队尾在后台一首一首往后取
  void fillRadio(provider, serverId, RADIO_ENTRY_UPCOMING).catch((error: unknown) => {
    console.warn('漫游首轮补歌失败', error)
  })
}

/**
 * 漫游续歌：队尾不足目标值就一首一首往后取。
 * 飞牛的游标是「当前这首的 roamId」，一次只能推进一首，不能批量取，
 * 所以「一直往下翻」靠这里反复推进游标实现。
 */
export async function fillRadio(
  provider: MusicProvider,
  serverId: string,
  upcomingTarget: number = RADIO_UPCOMING_KEEP,
): Promise<void> {
  if (!provider.radioNext || !radioCursor || radioFilling) return
  const session = radioSession
  radioFilling = true
  try {
    for (;;) {
      if (session !== radioSession) break
      const { queue, index } = usePlayerStore.getState()
      const upcoming = queue.length - index - 1
      if (upcoming >= upcomingTarget || upcoming > 60) break
      const cursor: string | undefined = radioCursor
      if (!cursor) break
      const slice = await provider.radioNext(cursor)
      if (session !== radioSession) break
      // 游标没往前走就停手，避免死循环刷同一首
      if (!slice.cursor || slice.cursor === cursor) break
      radioCursor = slice.cursor
      await appendTracks({ provider, serverId, tracks: [slice.current] })
    }
  } catch {
    // 续歌失败不影响已经在放的队列，下次再试
  } finally {
    if (session === radioSession) radioFilling = false
  }
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

export async function cycleCurrentToQueueEnd(oldCurrent: QueueItem): Promise<void> {
  const provider = activeProvider
  if (!provider) return
  try {
    const rntpTrack = await toRntpTrack(oldCurrent, provider, { allowTranscode: false })
    await TrackPlayer.add(rntpTrack)
    await TrackPlayer.remove([0])
  } catch {
    await TrackPlayer.remove([0]).catch(() => undefined)
  }
}

export async function togglePlay(): Promise<void> {
  await ensurePlayer()
  const state = await TrackPlayer.getPlaybackState()
  if (state.state === 'playing') {
    await TrackPlayer.pause()
  } else {
    const store = usePlayerStore.getState()
    const progress = await TrackPlayer.getProgress()
    const isAtEnd = store.playbackEnded || (progress.duration > 0 && progress.position >= progress.duration - 0.5)
    if (isAtEnd) {
      store.setPlaybackEnded(false)
      await TrackPlayer.seekTo(0)
    }
    await TrackPlayer.play()
  }
}

/** 切歌后把 RNTP 的真实下标同步回 store（事件没跟上时 UI 也不会停在旧歌名） */
async function syncIndexFromPlayer(): Promise<void> {
  try {
    const active = await TrackPlayer.getActiveTrackIndex()
    if (typeof active === 'number') usePlayerStore.getState().setIndex(active)
  } catch {
    // 播放器没就绪时忽略，等事件自己来
  }
}

/** 3 秒内按上一首视作「回到上一首」，否则回到本曲开头（对齐 Apple Music） */
export async function skipToPreviousSmart(): Promise<void> {
  await ensurePlayer()
  const store = usePlayerStore.getState()
  if (store.playbackEnded) {
    store.setPlaybackEnded(false)
    await TrackPlayer.seekTo(0)
    return
  }
  const progress = await TrackPlayer.getProgress()
  if (progress.position > 3) {
    await TrackPlayer.seekTo(0)
    return
  }
  try {
    await TrackPlayer.skipToPrevious()
  } catch {
    // 已经是第一首：回到开头
    await TrackPlayer.seekTo(0)
  }
  await syncIndexFromPlayer()
}

export async function skipToNextSafe(): Promise<void> {
  const { queue } = usePlayerStore.getState()
  if (queue.length <= 1) {
    // 已经是最后一首
    return
  }
  try {
    await TrackPlayer.skipToNext()
  } catch {
    try {
      await TrackPlayer.skip(1)
    } catch {
      // 忽略
    }
  }
}

/** 待播列表点某一行：只取出选中项成为当前，其他待播顺序保持不变。 */
export async function skipToIndex(index: number): Promise<void> {
  if (index <= 0) return
  await ensurePlayer()
  try {
    await TrackPlayer.skip(index)
    await TrackPlayer.play()
  } catch {
    // 下标越界（队列刚被改过）时忽略
  }
}

/** 历史点播创建新 occurrence；历史日志和待播列表都保持不变。 */
export function playHistoryItem(item: QueueItem): Promise<void> {
  const provider = activeProvider
  if (!provider) return Promise.resolve()
  return queueMutations.run(async () => {
    await ensurePlayer()
    const selected = { ...item, qid: nextQueueId(item.serverId, item.trackId) }
    const track = await toRntpTrack(selected, provider, { allowTranscode: true })
    pendingHistoryActivation = { qid: selected.qid, item }
    try {
      await TrackPlayer.add(track, 0)
      await TrackPlayer.skip(0)
      await TrackPlayer.play()
    } catch (error) {
      pendingHistoryActivation = undefined
      throw error
    }
  })
}

/** 队列页拖动排序：先改播放器队列，再同步本地展示顺序 */
async function moveInQueueMutation(from: number, to: number): Promise<void> {
  if (from === to) return
  await ensurePlayer()
  try {
    await TrackPlayer.move(from, to)
  } catch {
    return
  }
  usePlayerStore.getState().moveItem(from, to)
}

export function moveInQueue(from: number, to: number): Promise<void> {
  return queueMutations.run(() => moveInQueueMutation(from, to))
}

/** 队列页删除一首；当前播放那首不允许删（避免打断播放） */
async function removeFromQueueMutation(index: number): Promise<void> {
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

export function removeFromQueue(index: number): Promise<void> {
  return queueMutations.run(() => removeFromQueueMutation(index))
}

/** 清空独立历史日志，不修改 RNTP 当前曲目或待播队列。 */
async function clearHistoryMutation(): Promise<void> {
  usePlayerStore.getState().clearHistory()
}

export function clearHistory(): Promise<void> {
  return queueMutations.run(clearHistoryMutation)
}

/** 清空队列并停止播放；转码会话必须显式退出，否则服务端会留着转码进程 */
async function clearQueueMutation(): Promise<void> {
  prefetchToken += 1
  forcedTranscode.clear()
  resetRadioSession()
  await clearWarmTranscode()
  await ensurePlayer()
  await stopTranscodeSession()
  await TrackPlayer.reset()
  usePlayerStore.getState().clear()
  // 清空是用户主动的：下次进来应该是全新状态，别把旧会话又恢复出来
  await clearPlaybackSnapshot()
}

export function clearQueue(): Promise<void> {
  playbackGeneration.advance()
  return queueMutations.run(clearQueueMutation)
}

const REPEAT_ORDER: RepeatMode[] = ['off', 'queue', 'one']

export async function cycleRepeat(): Promise<RepeatMode> {
  const current = usePlayerStore.getState().playMode.repeat
  const next = REPEAT_ORDER[(REPEAT_ORDER.indexOf(current) + 1) % REPEAT_ORDER.length]!
  try {
    await ensurePlayer()
    await TrackPlayer.setRepeatMode(
      next === 'one' ? RntpRepeatMode.Track : next === 'queue' ? RntpRepeatMode.Queue : RntpRepeatMode.Off,
    )
  } catch (error) {
    // 原生播放器没就绪等瞬时失败：保持当前模式，下次再点即可
    console.warn('切换循环模式失败', error)
    return current
  }
  usePlayerStore.getState().setRepeat(next)
  return next
}

/** Fisher–Yates 洗牌，返回新数组 */
function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = result[i]!
    result[i] = result[j]!
    result[j] = a
  }
  return result
}

/**
 * 随机播放开 / 关。
 *
 * 只重排「当前曲目之后」的部分：当前这首和已经播过的保持原位，
 * 所以切换随机不会打断正在播的歌（也不用 seek，没有声音断点）。
 * 关闭时按 store 里的原始顺序快照（baseQueue）还原待播部分。
 */
async function setShuffledOrderMutation(shuffle: boolean): Promise<void> {
  await ensurePlayer()
  const store = usePlayerStore.getState()
  if (store.playMode.shuffle === shuffle) return

  const { queue, index, baseQueue } = store
  // 先翻转开关：重排是尽力而为，失败也不能让按钮卡在旧状态。
  store.setShuffle(shuffle)

  // 队尾只剩一首就没什么可排的了
  if (index < 0 || queue.length - index < 3) return

  const head = queue.slice(0, index + 1)
  const played = new Set(head.map((item) => item.qid))
  const tail = shuffle
    ? shuffled(queue.slice(index + 1))
    : baseQueue.filter((item) => !played.has(item.qid))

  const start = index + 1
  try {
    // 随机/还原只是重排顺序：曲目都已在播放器里，用 move 原位挪动即可，
    // 不重新生成播放地址，所以是纯原生操作、瞬时完成。
    await reorderRntpUpcoming(start, tail, queue)
  } catch (error) {
    // 重排是用户主动操作，失败要有日志；开关已翻转，不会卡住
    console.warn('随机播放重排失败', error)
    return
  }
  // RNTP 队列已就位；期间没有新的切歌/追加才同步展示顺序
  const latest = usePlayerStore.getState()
  if (latest.queue !== queue) return
  latest.reorder([...head, ...tail], index)
}

/**
 * 用 RNTP 的 move 把「当前曲目之后」的原生队列重排成 tail 的顺序。
 * RNTP 队列与 store 一一对应，current 是操作开始时的快照（与 tail 同源）。
 */
async function reorderRntpUpcoming(start: number, tail: QueueItem[], current: QueueItem[]): Promise<void> {
  const currentTail = current.slice(start)
  const moves = planTailReorder(currentTail, tail, (item) => item.qid)
  for (const [fromOffset, toOffset] of moves) {
    await TrackPlayer.move(start + fromOffset, start + toOffset)
  }
}

export function setShuffledOrder(shuffle: boolean): Promise<void> {
  return queueMutations.run(() => setShuffledOrderMutation(shuffle))
}

/** 兼容旧调用（专辑 / 艺术家页的「随机播放」按钮） */
export async function toggleShuffle(): Promise<boolean> {
  const next = !usePlayerStore.getState().playMode.shuffle
  await setShuffledOrder(next)
  return next
}

/**
 * 无限播放（对齐 Apple Music 的「自动播放」）：队列快播完时用漫游接着放。
 * 第一次调用会开一个漫游会话，之后复用 fillRadio 的游标继续往后取。
 */
export async function extendWithRadio(provider: MusicProvider, serverId: string): Promise<void> {
  if (!provider.radioStart || radioFilling) return
  if (!radioCursor) {
    const slice = await provider.radioStart()
    radioCursor = slice.cursor
    await appendTracks({ provider, serverId, tracks: [slice.current] })
  }
  await fillRadio(provider, serverId)
}

/** 随机播放与预取都要用 provider 重新生成播放地址，这里保存最近一次使用的实例 */
let activeProvider: MusicProvider | null = null
let pendingHistoryActivation: { qid: string; item: QueueItem } | undefined

export function takePendingHistoryActivation(qid: string): QueueItem | undefined {
  if (pendingHistoryActivation?.qid !== qid) return undefined
  const item = pendingHistoryActivation.item
  pendingHistoryActivation = undefined
  return item
}
/** 每次切歌都会重排预取顺序，旧的循环靠这个令牌自行退出 */
let prefetchToken = 0

export function rememberProvider(provider: MusicProvider | null): void {
  activeProvider = provider
  if (!provider) {
    prefetchToken += 1
    forcedTranscode.clear()
    resetRadioSession()
    void clearWarmTranscode()
  }
}

/**
 * 切歌之后调用：这首需要转码就换成 HLS 会话继续播，否则把上一首的会话收掉。
 * 起播失败重试（markForcedTranscode 之后）也走这里。
 */
async function ensureTranscodeForIndexMutation(
  index: number,
  generation: number,
  options: { resumePlayback?: boolean } = {},
): Promise<void> {
  const provider = activeProvider
  const item = usePlayerStore.getState().queue[index]
  if (!provider || !item || !playbackGeneration.isCurrent(generation)) return
  if (!shouldTranscode(item)) {
    await stopTranscodeSession()
    return
  }
  if (hasTranscodeSession(item.qid)) return
  const position = (await TrackPlayer.getProgress()).position
  const stream = (await takeWarmTranscode(item.qid))
    ?? (await provider.stream(item.trackId, { quality: 'original', allowTranscode: true }))
  if (!playbackGeneration.isCurrent(generation) || usePlayerStore.getState().queue[index]?.qid !== item.qid) {
    await stream.session?.close().catch(() => undefined)
    return
  }
  if (stream.session) await replaceTranscodeSession(item.qid, stream.session)
  else await stopTranscodeSession()
  const base = {
    id: item.qid,
    title: item.title,
    artist: item.artistText,
    ...(item.albumText ? { album: item.albumText } : {}),
    duration: item.durationMs / 1000,
  }
  await TrackPlayer.load({
    ...base,
    url: stream.url,
    headers: stream.headers,
    ...(stream.transport === 'hls' ? { type: TrackType.HLS } : {}),
  })
  // 保留已播进度（原生播放失败重试时用得上）
  if (position > 1) await TrackPlayer.seekTo(position)
  if (options.resumePlayback !== false) await TrackPlayer.play()
}

export function ensureTranscodeForIndex(index: number, options?: { resumePlayback?: boolean }): Promise<void> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => ensureTranscodeForIndexMutation(index, generation, options))
}

/**
 * 把当前这首和后两首放进播放缓存。当前那首本次仍然走网络直连
 * （不等下载完，起播不能变慢），缓存是为了下次听得更快、离线也能听。
 */
export function schedulePrefetch(index: number): void {
  const provider = activeProvider
  if (!provider || index < 0) return
  const { queue } = usePlayerStore.getState()
  const nextTranscode = queue[index + 1]
  const shouldPrewarm = nextTranscode ? shouldTranscode(nextTranscode) : false
  const targets = queue.slice(index, index + 1 + PREFETCH_AHEAD).filter((item) => !shouldTranscode(item))
  protectTracks(targets.map(toCacheTarget))

  prefetchToken += 1
  const token = prefetchToken
  void (async () => {
    if (nextTranscode && shouldPrewarm) {
      try {
        const stream = await provider.stream(nextTranscode.trackId, { quality: 'original', allowTranscode: true })
        if (token !== prefetchToken || usePlayerStore.getState().queue[index + 1]?.qid !== nextTranscode.qid) {
          await stream.session?.close().catch(() => undefined)
          return
        }
        await setWarmTranscode(nextTranscode.qid, stream)
      } catch {
        // 预热失败不影响当前播放，切过去时仍会按原流程即时创建。
      }
    } else {
      await clearWarmTranscode()
    }
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

// ---- 冷启动恢复上次会话 ----

/**
 * 恢复期间关掉「上报起播」：重建队列会触发换歌事件，但用户还没真的在听。
 * RNTP 的事件是异步派发的，解除抑制要晚一点（finally 里 setTimeout）。
 */
let suppressingReports = false

/** 正在恢复旧会话：这一次的换歌事件不要上报给服务端 */
export function isRestoringSession(): boolean {
  return suppressingReports
}

/**
 * 把上次存下来的会话放回播放器：重建 RNTP 队列、跳到那首歌、退到那个进度，
 * 但**不自动播放**——迷你播放器会显示，用户点了播放才继续响。
 * 队列 / 模式 / 进度 / 随机状态一起由 store.restore 放回去。
 */
export async function restoreQueuedPlayback(
  provider: MusicProvider,
  snapshot: NonNullable<ReturnType<typeof readPlaybackSnapshot>>,
): Promise<boolean> {
  const hydrateArtwork = (item: QueueItem): QueueItem =>
    item.coverId ? { ...item, artwork: provider.image(item.coverId, ARTWORK_SIZE) } : item
  const items = snapshot.queue.map(hydrateArtwork)
  const historyItems = snapshot.history.map(hydrateArtwork)
  const baseItems = snapshot.baseQueue.map(hydrateArtwork)
  if (items.length === 0) return false
  await ensurePlayer()

  // 恢复是异步的：等 ensurePlayer 的工夫里用户（或某条自动化）可能已经
  // 开始放新队列了，那就别用旧会话把正在放的顶掉
  if (usePlayerStore.getState().queue.length > 0) return false

  suppressingReports = true
  try {
    const index = Math.min(Math.max(snapshot.index, 0), items.length - 1)
    const rntpTracks = await Promise.all(
      items.map((item, itemIndex) => toRntpTrack(item, provider, { allowTranscode: itemIndex === index })),
    )
    // 转码 / 鉴权等网络步骤也可能耗时，回到主线程前再查一次
    if (usePlayerStore.getState().queue.length > 0) return false
    await TrackPlayer.reset()
    await TrackPlayer.add(rntpTracks)
    // 循环模式直接给原生播放器，别等用户去队列页点
    await TrackPlayer.setRepeatMode(
      snapshot.playMode.repeat === 'one'
        ? RntpRepeatMode.Track
        : snapshot.playMode.repeat === 'queue'
          ? RntpRepeatMode.Queue
          : RntpRepeatMode.Off,
    )
    if (index > 0) await TrackPlayer.skip(index)
    const position = snapshot.position ?? 0
    if (position > 1) await TrackPlayer.seekTo(position)

    usePlayerStore.getState().restore({
      queue: items,
      history: historyItems,
      baseQueue: baseItems.length === items.length ? baseItems : items,
      index,
      source: snapshot.source,
      playMode: snapshot.playMode,
      autoplay: snapshot.autoplay,
      lyricOffsetMs: snapshot.lyricOffsetMs ?? 0,
    })
    // 冷启动已为当前歌曲创建所需转码会话；仍显式暂停，绝不恢复播放动作。
    await TrackPlayer.pause()

    // 换歌事件异步到来时 store 已就位，refetch 封面与预取照常跑
    void refreshArtwork(index)
    schedulePrefetch(index)
    return true
  } finally {
    setTimeout(() => {
      suppressingReports = false
    }, 1500)
  }
}
