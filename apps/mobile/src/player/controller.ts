import TrackPlayer, { RepeatMode as RntpRepeatMode, TrackType, type AddTrack } from 'react-native-track-player'
import type { PlaySource, QueueItem, RepeatMode, StreamRequest, Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import { cacheArtwork } from './artwork'
import { cacheAudio, cachedAudioUri, protectTracks, captureAudioCacheGeneration, isAudioCacheGenerationCurrent, abortAudioCaching } from './audio-cache'
import { downloadedUri } from './downloads'
import {
  ARTWORK_SIZE,
  nextQueueId,
  resetForcedTranscode,
  resolveLocalPlaybackResource,
  shouldTranscode,
  toCacheTarget,
  toQueueItem,
} from './track-mapping'
import { clearRequestedPlaybackPosition, getPlaybackIntent, setNetworkPlaybackCheckpoint, setPlaybackIntent } from './playback-intent'
import { canUsePlaybackNetwork, requirePlaybackNetwork } from './network-access'
import { GenerationToken } from './generation-token'
import { clearPlaybackSnapshot, readPlaybackSnapshot } from './persist'
import { planTailReorder } from './queue-reorder'
import { ensurePlayer } from './setup'
import { promoteUpcomingTrackSource } from './native-queue-source'
import { AsyncMutationQueue } from './mutation-queue'
import { usePlayerStore } from './store'
import { clearWarmTranscode, getWarmTranscode, setWarmTranscode, takeWarmTranscode } from './transcode-prewarm'
import {
  abortTranscodeCaching,
  cachedTranscodeUri,
  startTranscodeCaching,
} from './transcode-cache'
import { hasTranscodeSession, isTranscodeSessionCurrent, replaceTranscodeSession, stopTranscodeSession } from './transcode-session'
import { isAutoCacheEnabled } from '../lib/cache-preferences'
import { useAudioQualityPreferences } from '../lib/audio-quality-preferences'
import { getPlaybackNetworkType, selectPlaybackQuality, type StreamQuality } from '../lib/playback-quality'

// 曲目映射层（领域曲目 → 队列元素 / RNTP / 缓存目标，及强制转码标记）已拆分到 track-mapping.ts，
// 这里转出其公开 API，调用方（含既有测试）的 import 路径保持不变。
export {
  clearForcedTranscode,
  markForcedTranscode,
  resolveLocalPlaybackResource,
  shouldTranscode,
  toQueueItem,
} from './track-mapping'

/** 预取范围：当前这首 + 后面两首 */
let queueMutations = makePlaybackQueue()
/**
 * RNTP 提交段不能在外层 watchdog 放行后并发执行。
 * 网络/转码准备可以被 playbackGeneration 废弃；reset/add/load/play 等原生副作用
 * 必须在这条有超时隔离的短队列中保持串行，避免旧 Promise 诈尸时与新提交交错。
 */
export const NATIVE_COMMIT_TIMEOUT_MS = 10_000
let nativeCommitQueue = new AsyncMutationQueue()
let nativeCommitEpoch = 0

function isNativeCommitCurrent(generation: number, epoch: number): boolean {
  return playbackGeneration.isCurrent(generation) && epoch === nativeCommitEpoch
}

/**
 * RNTP 调用不能无限等待：超时后废弃当前提交代次并换一条 lane，
 * 让后续点播恢复；旧 Promise 即使迟到，也会在下一步的 epoch 检查处停止。
 */
function runNativeCommit<T>(mutation: (epoch: number) => Promise<T>, label: string): Promise<T> {
  const queue = nativeCommitQueue
  const epoch = nativeCommitEpoch
  return queue.run(() => mutation(epoch), { timeoutMs: NATIVE_COMMIT_TIMEOUT_MS, label }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('超时') && nativeCommitQueue === queue) {
      nativeCommitEpoch += 1
      nativeCommitQueue = new AsyncMutationQueue()
    }
    throw error
  })
}
const playbackGeneration = new GenerationToken()

function makePlaybackQueue(): AsyncMutationQueue {
  const queue = new AsyncMutationQueue(() => {
    if (queueMutations === queue) invalidatePlaybackIntents()
  })
  return queue
}

class SupersededPlayback extends Error {}

function checkGeneration(generation: number): void {
  if (!playbackGeneration.isCurrent(generation)) throw new SupersededPlayback('播放操作已取消')
}

async function guarded<T>(generation: number, operation: () => Promise<T>): Promise<T> {
  checkGeneration(generation)
  try {
    const result = await operation()
    checkGeneration(generation)
    return result
  } catch (error) {
    checkGeneration(generation)
    throw error
  }
}

async function nativeCommand<T>(generation: number, operation: () => Promise<T>): Promise<T> {
  return runNativeCommit(async (epoch) => {
    checkGeneration(generation)
    if (!isNativeCommitCurrent(generation, epoch)) throw new SupersededPlayback('原生提交已取消')
    const result = await guarded(generation, operation)
    if (!isNativeCommitCurrent(generation, epoch)) throw new SupersededPlayback('原生提交已取消')
    return result
  }, '播放控制')
}

function ignoreSuperseded(error: unknown): void {
  if (!(error instanceof SupersededPlayback)) throw error
}

// A new playback request must not wait behind an obsolete network request.
// Native commit ordering is retained separately; every continuation validates its owner.
function beginPlaybackIntent(wantsPlay = true, requestedPosition?: number, options: { invalidatePrefetch?: boolean } = {}): number {
  setPlaybackIntent(wantsPlay, requestedPosition)
  const generation = playbackGeneration.advance()
  queueMutations = makePlaybackQueue()
  if (options.invalidatePrefetch !== false) prefetchToken += 1
  pendingPreviousActivation = undefined
  pendingNavigation = undefined
  pendingHistoryActivation = undefined
  loadingListInput = undefined
  loadingPlaybackGeneration = undefined
  usePlayerStore.getState().setPendingCurrent(undefined)
  return generation
}

let loadingPlaybackGeneration: number | undefined
let loadingListInput: PlayListInput | undefined

function setLoadingForGeneration(generation: number, loading: boolean): void {
  if (playbackGeneration.isCurrent(generation)) {
    usePlayerStore.getState().setIsLoadingAudio(loading)
  }
}

function clearPendingCurrent(generation: number): void {
  if (playbackGeneration.isCurrent(generation)) usePlayerStore.getState().setPendingCurrent(undefined)
}

function clearLoadingLater(generation: number, delayMs = 400): void {
  setTimeout(() => {
    setLoadingForGeneration(generation, false)
  }, delayMs)
}

async function getStreamQuality(): Promise<StreamQuality> {
  const { wifiQuality, cellularQuality } = useAudioQualityPreferences.getState()
  const networkType = await getPlaybackNetworkType()
  // 后端能不能真正按档位输出由 capabilities 决定；不能的话一律 original，
  // 否则「标准音质」会把每一首歌都推上转码链路（见 selectPlaybackQuality 的说明）。
  const supportsQualityTiers = activeProvider?.capabilities.qualityTiers ?? false
  return selectPlaybackQuality(networkType, { wifiQuality, cellularQuality }, supportsQualityTiers)
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
  options: { allowTranscode?: boolean; generation?: number; isCurrent?: () => boolean } = {},
): Promise<AddTrack> {
  const generation = options.generation ?? playbackGeneration.capture()
  const isCurrent = () => playbackGeneration.isCurrent(generation) && (options.isCurrent?.() ?? true)
  const checkCurrent = () => { if (!isCurrent()) throw new SupersededPlayback('播放操作已取消') }
  checkCurrent()
  const base = {
    id: item.qid,
    title: item.title,
    artist: item.artistText,
    ...(item.albumText ? { album: item.albumText } : {}),
    duration: item.durationMs / 1000,
  }
  const local = resolveLocalPlaybackResource(item)
  if (local) return { ...base, url: local.url, ...(local.contentType ? { contentType: local.contentType } : {}) }

  if (options.allowTranscode) await guarded(generation, requirePlaybackNetwork)
  const quality = options.allowTranscode ? await getStreamQuality() : 'original'
  checkCurrent()
  const transcode = Boolean(options.allowTranscode) && (shouldTranscode(item) || quality !== 'original')
  if (transcode) {
    const stream = await provider.stream(item.trackId, { quality, allowTranscode: true })
    if (!isCurrent()) {
      void stream.session?.close().catch(() => undefined)
      throw new SupersededPlayback('播放操作已取消')
    }
    if (stream.session) {
      await replaceTranscodeSession(item.qid, stream.session, isCurrent)
      cacheHlsStream(item, stream)
    }
    return {
      ...base,
      url: stream.url,
      headers: stream.headers,
      ...(stream.transport === 'hls' ? { type: TrackType.HLS } : {}),
    }
  }
  const stream = await provider.stream(item.trackId, { quality, allowTranscode: false })
  checkCurrent()
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
  /**
   * 列表的「下一页拉取器」（可选）。传了就能在队列近尾时静默补列表下一页，
   * 直到列表真末尾（与漫游无关）。参数是下一页页号，返回那一页（空/末页返回 undefined）。
   */
  loadMorePage?: (page: number) => Promise<Track[] | undefined>
  /** 起播时已加载到的页号（tracks 覆盖到这一页），续拉从下一页开始 */
  loadedPage?: number
}

/**
 * 当前队列来源列表的「续拉器」（模块级）。
 * 不能放进 PlaySource（那要序列化持久化），所以用模块变量存。
 * 换队列/漫游/单曲起播时清掉（那些不来自可翻页列表）。
 */
let listFeed: { next: (page: number) => Promise<Track[] | undefined>; nextPage: number; done: boolean } | undefined
let listFeedFilling = false

function resetListFeed(): void {
  listFeed = undefined
  listFeedFilling = false
}

/** 队列近尾时补列表下一页（与漫游解耦：这是「列表还没放完」，不看♾️）。 */
export async function fillFromListFeed(provider: MusicProvider, serverId: string): Promise<void> {
  const feed = listFeed
  const generation = playbackGeneration.capture()
  if (!feed || feed.done || listFeedFilling) return
  listFeedFilling = true
  try {
    const page = await feed.next(feed.nextPage)
    // 切换来源后，旧分页请求不能再标记新 feed、也不能把旧页追加到新队列。
    if (!playbackGeneration.isCurrent(generation) || listFeed !== feed) return
    if (!page || page.length === 0) {
      feed.done = true
      return
    }
    const committed = await queueMutations.run(
      () => appendTracksMutation({ provider, serverId, tracks: page }, generation),
      { label: '追加列表分页' },
    )
    if (!committed || !playbackGeneration.isCurrent(generation) || listFeed !== feed) return
    feed.nextPage += 1
  } catch {
    // 补页失败不影响已在放的队列，下次近尾再试
  } finally {
    // 只有发起这次请求的 feed 仍然有效时，旧请求才有资格释放标记。
    if (listFeed === feed) listFeedFilling = false
  }
}

/** 列表是否还有未拉的下一页（bridge 用它判断先补列表还是看♾️漫游） */
export function hasPendingListFeed(): boolean {
  return Boolean(listFeed && !listFeed.done)
}

/** 从一个列表开始播放（专辑、艺术家、搜索结果都走这里） */
async function playTrackListMutation(
  { provider, tracks, startIndex, source, loadMorePage, loadedPage }: PlayListInput,
  generation: number,
  preparedItems: QueueItem[],
): Promise<void> {
  if (tracks.length === 0) return
  if (!playbackGeneration.isCurrent(generation)) return
  setLoadingForGeneration(generation, true)
  try {
    await guarded(generation, () => ensurePlayer())
    if (!playbackGeneration.isCurrent(generation)) return

    const items = preparedItems
    const safeStart = Math.min(Math.max(startIndex, 0), items.length - 1)
    // 点列表第 N 首 = 「这首及之后」进队列，前段丢弃（对齐 Apple Music）。
    // baseQueue 恒存这段的原始顺序，供取消随机时还原。
    const sliced = items.slice(safeStart)
    const baseQueue = sliced
    // 尊重当前随机开关：开着 → 当前这首不动、其后打乱；关着 → 原始顺序。
    const shuffle = usePlayerStore.getState().playMode.shuffle
    const orderedItems =
      shuffle && sliced.length > 1 ? [sliced[0]!, ...shuffled(sliced.slice(1))] : sliced
    const rntpTracks = await Promise.all(
      orderedItems.map((item, itemIndex) => toRntpTrack(item, provider, { allowTranscode: itemIndex === 0, generation })),
    )
    if (!playbackGeneration.isCurrent(generation)) return

    const safeIndex = 0
    const committed = await runNativeCommit(async (commitEpoch) => {
      if (!isNativeCommitCurrent(generation, commitEpoch)) return false
      await guarded(generation, () => TrackPlayer.reset())
      if (!isNativeCommitCurrent(generation, commitEpoch)) return false
      await guarded(generation, () => TrackPlayer.add(rntpTracks))
      if (!isNativeCommitCurrent(generation, commitEpoch)) return false
      usePlayerStore.getState().setQueue(orderedItems, safeIndex, source, baseQueue)
      clearPendingCurrent(generation)
      loadingListInput = undefined
      if (!isNativeCommitCurrent(generation, commitEpoch)) return false
      return true
    }, '提交播放列表')
    if (!committed || !playbackGeneration.isCurrent(generation)) return
    // 只有 RNTP/store 提交成功后才切换来源和登记分页，避免旧代次污染新 feed。
    if (source.kind !== 'radio') resetRadioSession()
    if (loadMorePage) {
      listFeed = { next: loadMorePage, nextPage: (loadedPage ?? 1) + 1, done: false }
    } else {
      resetListFeed()
    }
    void refreshArtwork(safeIndex, generation)
    void refreshArtist(safeIndex, generation)
    schedulePrefetch(safeIndex)
    await guarded(generation, () => playWithNetworkPolicy(generation))
  } finally {
    if (playbackGeneration.isCurrent(generation) && loadingPlaybackGeneration === generation) {
      loadingPlaybackGeneration = undefined
      loadingListInput = undefined
    }
    clearPendingCurrent(generation)
    clearLoadingLater(generation)
  }
}

export function playTrackList(input: PlayListInput): Promise<void> {
  if (input.tracks.length === 0) return Promise.resolve()
  const generation = beginPlaybackIntent()
  loadingPlaybackGeneration = generation
  const safeStart = Math.min(Math.max(input.startIndex, 0), input.tracks.length - 1)
  loadingListInput = { ...input, startIndex: safeStart }
  const items = input.tracks.map((track) => toQueueItem(track, input.provider, input.serverId))
  usePlayerStore.getState().setPendingCurrent(items[safeStart])
  usePlayerStore.getState().setIsLoadingAudio(true)
  return queueMutations.run(() => playTrackListMutation(input, generation, items), { label: '开始播放列表' }).catch(ignoreSuperseded)
}

/**
 * 单曲播放：队列**只有这一首**，待播为空（对齐 Apple Music 的搜索点歌）。
 *
 * 搜索结果不是一个「歌单」，不把它当队列：只播选中那首，待播留空。
 * 待播空时队列页会提示「开启无限播放」；开了♾️→ bridge 的续歌分支用全库漫游填充。
 */
async function playSingleTrackMutation({ provider, source }: {
  provider: MusicProvider
  serverId: string
  track: Track
  source: PlaySource
}, generation: number, item: QueueItem): Promise<void> {
  if (!playbackGeneration.isCurrent(generation)) return
  setLoadingForGeneration(generation, true)
  try {
    await guarded(generation, () => ensurePlayer())
    if (!playbackGeneration.isCurrent(generation)) return
    const rntpTrack = await toRntpTrack(item, provider, { allowTranscode: true, generation })
    if (!playbackGeneration.isCurrent(generation)) return
    const committed = await runNativeCommit(async (commitEpoch) => {
      if (!isNativeCommitCurrent(generation, commitEpoch)) return false
      await guarded(generation, () => TrackPlayer.reset())
      if (!isNativeCommitCurrent(generation, commitEpoch)) return false
      await guarded(generation, () => TrackPlayer.add([rntpTrack]))
      if (!isNativeCommitCurrent(generation, commitEpoch)) return false
      usePlayerStore.getState().setQueue([item], 0, source, [item])
      clearPendingCurrent(generation)
      if (!isNativeCommitCurrent(generation, commitEpoch)) return false
      return isNativeCommitCurrent(generation, commitEpoch)
    }, '提交单曲播放')
    if (!committed || !playbackGeneration.isCurrent(generation)) return
    if (source.kind !== 'radio') resetRadioSession()
    resetListFeed()
    void refreshArtwork(0, generation)
    void refreshArtist(0, generation)
    await guarded(generation, () => playWithNetworkPolicy(generation))
  } finally {
    if (playbackGeneration.isCurrent(generation) && loadingPlaybackGeneration === generation) {
      loadingPlaybackGeneration = undefined
      loadingListInput = undefined
    }
    clearLoadingLater(generation)
  }
}

export function playSingleTrack(input: {
  provider: MusicProvider
  serverId: string
  track: Track
  source: PlaySource
}): Promise<void> {
  const generation = beginPlaybackIntent()
  loadingPlaybackGeneration = generation
  loadingListInput = undefined
  const item = toQueueItem(input.track, input.provider, input.serverId)
  usePlayerStore.getState().setPendingCurrent(item)
  usePlayerStore.getState().setIsLoadingAudio(true)
  return queueMutations.run(() => playSingleTrackMutation(input, generation, item), { label: '单曲播放' })
    .catch(ignoreSuperseded).finally(() => clearPendingCurrent(generation))
}

/** 往队尾追加曲目（漫游续歌、以后的「稍后播放」都用它）。追加的都不是当前曲目，所以不开转码 */
async function appendTracksMutation({
  provider,
  serverId,
  tracks,
}: Omit<PlayListInput, 'startIndex' | 'source'>, generation = playbackGeneration.capture()): Promise<boolean> {
  if (tracks.length === 0) return false
  if (!playbackGeneration.isCurrent(generation)) return false
  await guarded(generation, () => ensurePlayer())
  if (!playbackGeneration.isCurrent(generation)) return false
  const items = tracks.map((track) => toQueueItem(track, provider, serverId))
  const rntpTracks = await Promise.all(items.map((item) => toRntpTrack(item, provider, { generation })))
  if (!playbackGeneration.isCurrent(generation)) return false
  return runNativeCommit(async (commitEpoch) => {
    if (!isNativeCommitCurrent(generation, commitEpoch)) return false
    await guarded(generation, () => TrackPlayer.add(rntpTracks))
    if (!isNativeCommitCurrent(generation, commitEpoch)) return false
    usePlayerStore.getState().appendItems(items)
    schedulePrefetch(usePlayerStore.getState().index)
    return true
  }, '提交追加曲目')
}

export function appendTracks(input: Omit<PlayListInput, 'startIndex' | 'source'>): Promise<boolean> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => appendTracksMutation(input, generation), { label: '追加曲目' }).catch((error: unknown) => { ignoreSuperseded(error); return false })
}

/** 插入到当前曲目之后（「下一首播放」）。插入项不是当前曲目，不开转码 */
async function playNextMutation({
  provider,
  serverId,
  tracks,
}: Omit<PlayListInput, 'startIndex' | 'source'>, generation: number): Promise<boolean> {
  if (tracks.length === 0) return false
  await guarded(generation, () => ensurePlayer())
  const items = tracks.map((track) => toQueueItem(track, provider, serverId))
  const rntpTracks = await Promise.all(items.map((item) => toRntpTrack(item, provider, { generation })))
  const { index } = usePlayerStore.getState()
  await nativeCommand(generation, () => TrackPlayer.add(rntpTracks, index + 1))
  usePlayerStore.getState().insertAfterCurrent(items)
  schedulePrefetch(usePlayerStore.getState().index)
  return true
}

export function playNext(input: Omit<PlayListInput, 'startIndex' | 'source'>): Promise<boolean> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => playNextMutation(input, generation), { label: '下一首播放' }).catch((error: unknown) => { ignoreSuperseded(error); return false })
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
  beginPlaybackIntent()
  resetRadioSession()
  const generation = playbackGeneration.capture()
  const session = radioSession
  const slice = await provider.radioStart()
  if (!playbackGeneration.isCurrent(generation) || session !== radioSession) return
  await queueMutations.run(
    () =>
      playTrackListMutation({
        provider,
        serverId,
        tracks: [slice.current],
        startIndex: 0,
        source: { kind: 'radio', label: '漫游' },
      }, generation, [toQueueItem(slice.current, provider, serverId)]),
    { label: '开始漫游' },
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
  const generation = playbackGeneration.capture()
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
      const committed = await queueMutations.run(() => appendTracksMutation({ provider, serverId, tracks: [slice.current] }, generation))
      if (!committed || session !== radioSession || !playbackGeneration.isCurrent(generation)) break
      radioCursor = slice.cursor
    }
  } catch {
    // 续歌失败不影响已经在放的队列，下次再试
  } finally {
    if (session === radioSession) radioFilling = false
  }
}

const artistLookups = new Set<string>()

/** 艺术家 GUID 可用但列表名称为空时，从详情异步补齐，不阻塞起播。 */
export async function refreshArtist(index: number, generation = playbackGeneration.capture()): Promise<void> {
  if (!playbackGeneration.isCurrent(generation)) return
  const provider = activeProvider
  const item = usePlayerStore.getState().queue[index]
  if (!provider || !item?.artistId || item.artistText.trim() !== '未知艺术家' || artistLookups.has(item.qid)) return
  artistLookups.add(item.qid)
  try {
    const artist = await provider.artist(item.artistId)
    const name = artist.name.trim()
    if (!name || name === '未知艺术家' || !playbackGeneration.isCurrent(generation) || activeProvider !== provider) return
    const current = usePlayerStore.getState().queue[index]
    if (current?.qid !== item.qid || current.artistId !== item.artistId || current.artistText.trim() !== '未知艺术家') return
    usePlayerStore.getState().patchItem(item.trackId, {
      artistText: name,
      ...(current.track ? {
        track: {
          ...current.track,
          artists: current.track.artists.map((ref) => ref.id === item.artistId ? { ...ref, name } : ref),
        },
      } : {}),
    }, item.serverId)
    // 复用已缓存的封面，同时把更新后的艺人名写回系统“正在播放”。
    await refreshArtwork(index, generation)
  } catch {
    // 弱网时保留占位文案，下一次激活歌曲仍可重试。
  } finally {
    artistLookups.delete(item.qid)
  }
}

/** 把当前曲目的封面下载到本地并回填锁屏元数据 */
export async function refreshArtwork(index: number, generation = playbackGeneration.capture()): Promise<void> {
  if (!playbackGeneration.isCurrent(generation)) return
  const item = usePlayerStore.getState().queue[index]
  if (!item) return
  const uri = item.artwork
    ? await cacheArtwork(`${item.serverId}:${item.coverId ?? item.trackId}`, item.artwork)
    : undefined
  if (!playbackGeneration.isCurrent(generation)) return
  const current = usePlayerStore.getState().queue[index]
  if (current?.qid !== item.qid) return
  try {
    await nativeCommand(generation, () => TrackPlayer.updateMetadataForTrack(index, {
      title: current.title,
      artist: current.artistText,
      ...(current.albumText ? { album: current.albumText } : {}),
      ...(uri ? { artwork: uri } : {}),
      duration: current.durationMs / 1000,
    }))
  } catch {
    // 队列已变化时忽略
  }
}

export async function cycleCurrentToQueueEnd(oldCurrent: QueueItem): Promise<void> {
  const generation = playbackGeneration.capture()
  const provider = activeProvider
  if (!provider) return
  try {
    const rntpTrack = await toRntpTrack(oldCurrent, provider, { allowTranscode: false, generation })
    await nativeCommand(generation, () => TrackPlayer.add(rntpTrack))
    await nativeCommand(generation, () => TrackPlayer.remove([0]))
  } catch {
    await nativeCommand(generation, () => TrackPlayer.remove([0]).catch(() => undefined))
  }
}

/** Remove an event's consumed occurrence by identity, never a stale index. */
export async function removeConsumedNativeTrack(qid: string): Promise<void> {
  const generation = playbackGeneration.capture()
  try {
    await nativeCommand(generation, async () => {
      const queue = await guarded(generation, () => TrackPlayer.getQueue())
      const index = queue.findIndex((item) => item.id === qid)
      if (index >= 0) await guarded(generation, () => TrackPlayer.remove([index]))
    })
  } catch (error) {
    if (!(error instanceof SupersededPlayback)) console.warn('移除已播放曲目失败', error)
  }
}

function hasLocalNativeUrl(track: Pick<AddTrack, 'url'> | undefined): boolean {
  return typeof track?.url === 'string' && /^(file|content):/i.test(track.url)
}

async function requireNetworkForNativeTrack(generation: number, track: Pick<AddTrack, 'url'> | undefined): Promise<void> {
  if (!hasLocalNativeUrl(track)) await guarded(generation, requirePlaybackNetwork)
}

async function nativeTrackForQueueId(generation: number, qid: string): Promise<{ index: number; track: AddTrack }> {
  const queue = await guarded(generation, () => TrackPlayer.getQueue())
  const index = queue.findIndex((entry) => entry.id === qid)
  if (index < 0) throw new Error('目标歌曲已不在播放队列中')
  return { index, track: queue[index]! }
}

/** Ask the native queue owner to atomically promote a still-upcoming cached source. */
async function promoteQueuedLocalSource(generation: number, qid: string): Promise<boolean> {
  const item = usePlayerStore.getState().queue.find((entry) => entry.qid === qid)
  const local = item && resolveLocalPlaybackResource(item)
  if (!item || !local || !playbackGeneration.isCurrent(generation)) return false
  const nativeQueue = await guarded(generation, () => TrackPlayer.getQueue())
  const index = nativeQueue.findIndex((entry) => entry.id === qid)
  const native = nativeQueue[index]
  if (index < 0 || !native || native.url === local.url || hasLocalNativeUrl(native)) return false
  const activeIndex = await guarded(generation, () => TrackPlayer.getActiveTrackIndex())
  if (activeIndex === index) return false
  const stillSameOccurrence = usePlayerStore.getState().queue.some((entry) => entry.qid === qid)
  if (!stillSameOccurrence) return false
  return promoteUpcomingTrackSource(qid, String(native.url), {
    url: local.url,
    ...(local.contentType ? { contentType: local.contentType } : {}),
  })
}

function cacheHlsStream(item: QueueItem, stream: { url: string; headers?: Record<string, string>; transport?: string; session?: import('@qj/core-domain').StreamSession }): void {
  if (stream.transport !== 'hls' || !stream.session || !canUsePlaybackNetwork()) return
  const session = stream.session
  const shouldAbort = () => !isTranscodeSessionCurrent(item.qid, session)
  if (shouldAbort()) return
  void startTranscodeCaching({
    serverId: item.serverId,
    trackId: item.trackId,
    playlistUrl: stream.url,
    ...(stream.headers ? { headers: stream.headers } : {}),
    sourceDurationSeconds: item.durationMs / 1000,
    shouldAbort,
  }).then(async () => {
    if (!shouldAbort() && usePlayerStore.getState().queue.some((entry) => entry.qid === item.qid)) {
      await promoteQueuedLocalSource(playbackGeneration.capture(), item.qid).catch(() => false)
    }
  })
}

/** Check the final native URL before skip; cache bookkeeping can be newer than RNTP. */
async function skipToNativeQueueTrack(generation: number, qid: string): Promise<void> {
  await promoteQueuedLocalSource(generation, qid)
  const target = await nativeTrackForQueueId(generation, qid)
  await requireNetworkForNativeTrack(generation, target.track)
  checkGeneration(generation)
  await nativeCommand(generation, async () => {
    const latest = await guarded(generation, () => TrackPlayer.getQueue())
    const index = latest.findIndex((entry) => entry.id === qid)
    if (index < 0 || latest[index]?.url !== target.track.url) {
      throw new SupersededPlayback('原生目标歌曲已变化')
    }
    await guarded(generation, () => TrackPlayer.skip(index))
  })
}

async function playWithNetworkPolicy(generation: number, stillCurrent: () => boolean = () => true): Promise<void> {
  const check = () => {
    checkGeneration(generation)
    if (!stillCurrent()) throw new SupersededPlayback('播放目标已变化')
  }
  check()
  const nativeTrack = await guarded(generation, () => TrackPlayer.getActiveTrack())
  check()
  await requireNetworkForNativeTrack(generation, nativeTrack ?? undefined)
  check()
  checkGeneration(generation)
  if (!getPlaybackIntent().wantsPlay) return
  await TrackPlayer.play()
}

export async function pausePlayback(stop = false): Promise<void> {
  // Cancel network/decoder continuations before waiting for native commands.
  const generation = beginPlaybackIntent(false, undefined, { invalidatePrefetch: false })
  usePlayerStore.getState().setIsLoadingAudio(false)
  await guarded(generation, () => ensurePlayer())
  await nativeCommand(generation, () => stop ? TrackPlayer.stop() : TrackPlayer.pause())
}

export async function resumePlayback(): Promise<void> {
  setPlaybackIntent(true)
  const generation = playbackGeneration.capture()
  await guarded(generation, () => ensurePlayer())
  const store = usePlayerStore.getState()
  const intent = getPlaybackIntent()
  const current = store.queue[store.index]
  const checkpoint = intent.networkCheckpoint
  if (checkpoint && current && checkpoint.qid === current.qid) {
    const revision = intent.revision
    const stillCurrent = () =>
      getPlaybackIntent().revision === revision
      && getPlaybackIntent().wantsPlay
      && usePlayerStore.getState().queue[usePlayerStore.getState().index]?.qid === checkpoint.qid
    store.setIsLoadingAudio(true)
    try {
      const recovered = await recoverPlaybackAfterNetwork(checkpoint.qid, checkpoint.position, stillCurrent)
      if (recovered && stillCurrent()) setNetworkPlaybackCheckpoint(undefined)
    } finally {
      setLoadingForGeneration(generation, false)
    }
    return
  }
  const progress = await guarded(generation, () => TrackPlayer.getProgress())
  let resumePosition = progress.position
  if (store.playbackEnded || (progress.duration > 0 && progress.position >= progress.duration - 0.5)) {
    store.setPlaybackEnded(false)
    await nativeCommand(generation, () => TrackPlayer.seekTo(0))
    resumePosition = 0
  }
  // A paused native item is already prepared. Only rebind when policy blocks
  // its remote URL and a complete local copy can satisfy the same occurrence.
  try {
    if (!canUsePlaybackNetwork() && current) {
      const resource = resolveLocalPlaybackResource(current)
      const active = await guarded(generation, () => TrackPlayer.getActiveTrack())
      if (resource && active?.id === current.qid && active.url !== resource.url) {
        await stopTranscodeSession(undefined, () => playbackGeneration.isCurrent(generation))
        await nativeCommand(generation, () => TrackPlayer.load({
          id: current.qid,
          title: current.title,
          artist: current.artistText,
          ...(current.albumText ? { album: current.albumText } : {}),
          ...(active.artwork ? { artwork: active.artwork } : {}),
          duration: current.durationMs / 1000,
          url: resource.url,
          ...(resource.contentType ? { contentType: resource.contentType } : {}),
        }))
        if (resumePosition > 0) await nativeCommand(generation, () => TrackPlayer.seekTo(resumePosition))
      }
    }
    await guarded(generation, () => playWithNetworkPolicy(generation))
  } finally {
    setLoadingForGeneration(generation, false)
    if (current) schedulePrefetch(store.index)
  }
}

export async function seekAndPlay(seconds: number): Promise<void> {
  const generation = beginPlaybackIntent(true, seconds)
  const revision = getPlaybackIntent().revision
  try {
    await guarded(generation, () => ensurePlayer())
    await nativeCommand(generation, () => TrackPlayer.seekTo(seconds))
    await guarded(generation, () => playWithNetworkPolicy(generation))
  } finally {
    clearRequestedPlaybackPosition(revision)
  }
}

/** A manual seek invalidates stale recovery but preserves the user's play/pause choice. */
export async function seekPlayback(seconds: number): Promise<void> {
  const generation = beginPlaybackIntent(getPlaybackIntent().wantsPlay, seconds)
  const revision = getPlaybackIntent().revision
  try {
    await guarded(generation, () => ensurePlayer())
    await nativeCommand(generation, () => TrackPlayer.seekTo(seconds))
  } finally {
    clearRequestedPlaybackPosition(revision)
  }
}

export async function togglePlay(): Promise<void> {
  const generation = playbackGeneration.capture()
  await guarded(generation, () => ensurePlayer())
  const { state } = await guarded(generation, () => TrackPlayer.getPlaybackState())
  if (getPlaybackIntent().waitingForNetwork || state === 'playing' || ((state === 'buffering' || state === 'loading') && getPlaybackIntent().wantsPlay)) {
    await pausePlayback()
  } else {
    await resumePlayback()
  }
}

/** Abort automatic audio traffic without deleting the user's cached files/downloads. */
export function suspendPlaybackNetworkWork(): void {
  prefetchToken += 1
  abortAudioCaching()
  abortTranscodeCaching()
  void clearWarmTranscode().catch((error: unknown) => console.warn('取消预热失败', error))
}

/** Policy stop releases the network asset; user intent and saved position live in the monitor. */
export async function stopPlaybackForNetwork(qid: string, revision: number, stillCurrent: () => boolean): Promise<void> {
  const generation = playbackGeneration.capture()
  await nativeCommand(generation, async () => {
    const { queue, index, pendingCurrent } = usePlayerStore.getState()
    if (!stillCurrent() || pendingCurrent || queue[index]?.qid !== qid || getPlaybackIntent().revision !== revision) return
    await TrackPlayer.stop()
  })
}

/** Re-resolve expiring URLs/HLS sessions, retaining queue identity and interruption position. */
export async function recoverPlaybackAfterNetwork(
  qid: string, position: number, stillCurrent: () => boolean, recoverRoute = false,
): Promise<boolean> {
  const generation = playbackGeneration.capture()
  const provider = activeProvider
  const { queue, index, pendingCurrent } = usePlayerStore.getState()
  const item = queue[index]
  if (!provider || pendingCurrent || item?.qid !== qid || !stillCurrent()) return false
  const check = () => {
    checkGeneration(generation)
    if (!stillCurrent() || usePlayerStore.getState().queue[usePlayerStore.getState().index]?.qid !== qid) {
      throw new SupersededPlayback('网络恢复已取消')
    }
  }
  check()
  // Native media requests bypass the provider HTTP client. Recover their failed route
  // before resolving a replacement URL, while keeping local playback completely offline.
  const hasLocalCopy = downloadedUri(item.serverId, item.trackId)
    || cachedTranscodeUri(item.serverId, item.trackId) || cachedAudioUri(toCacheTarget(item))
  if (recoverRoute && provider.routing && !hasLocalCopy) {
    await guarded(generation, requirePlaybackNetwork)
    check()
    const native = await TrackPlayer.getActiveTrack()
    check()
    if (native?.id === qid && typeof native.url === 'string' && /^https?:/i.test(native.url)) {
      const changed = await provider.routing.recover(native.url)
      check()
      if (changed) {
        prefetchToken += 1
        await clearWarmTranscode()
        check()
      }
    }
  }
  const track = await toRntpTrack(item, provider, { allowTranscode: true, generation, isCurrent: stillCurrent })
  check()
  // Reconnect may refresh headers or HLS session data while leaving the URL
  // text unchanged, so this recovery path always installs the newly resolved track.
  await nativeCommand(generation, async () => { check(); await TrackPlayer.pause() })
  check()
  await nativeCommand(generation, async () => { check(); await TrackPlayer.load(track) })
  check()
  if (Number.isFinite(position) && position > 0) {
    await nativeCommand(generation, async () => { check(); await TrackPlayer.seekTo(position) })
  }
  check()
  await playWithNetworkPolicy(generation, () => {
    check()
    return true
  })
  check()
  schedulePrefetch(usePlayerStore.getState().index)
  return true
}

/** A cursor over the last committed queue/history, including uncommitted taps. */
interface PendingNavigation {
  queue: QueueItem[]
  history: QueueItem[]
  index: number
  offset: number
}
let pendingNavigation: PendingNavigation | undefined

function navigationFromStore(): PendingNavigation {
  return pendingNavigation ?? { ...usePlayerStore.getState(), offset: 0 }
}

function finishNavigation(generation: number): void {
  if (!playbackGeneration.isCurrent(generation)) return
  pendingNavigation = undefined
  clearPendingCurrent(generation)
}

/** 点击上一首：加载中的选择也参与导航，不排在旧请求之后。 */
export async function skipToPreviousSmart(): Promise<void> {
  if (loadingListInput) {
    if (loadingListInput.startIndex > 0) {
      return playTrackList({ ...loadingListInput, startIndex: loadingListInput.startIndex - 1 })
    }
    if (usePlayerStore.getState().history.length === 0) return
  }
  const navigation = navigationFromStore()
  // A single-track request has no upcoming list. Its previous target is the
  // still-committed current item, which has not been archived yet.
  if (!loadingListInput && !pendingNavigation && usePlayerStore.getState().pendingCurrent) {
    const current = navigation.queue[navigation.index]
    if (current) return selectQueuedItem(current, navigation)
    return
  }
  if (pendingNavigation && navigation.offset > 0) {
    const next = { ...navigation, offset: navigation.offset - 1 }
    const target = next.queue[next.index + next.offset]
    if (target) return selectQueuedItem(target, next)
  }
  const store = usePlayerStore.getState()
  const provider = activeProvider
  if (provider && !store.playbackEnded && navigation.history.length + navigation.offset > 0) {
    return selectPreviousItems(provider, { ...navigation, offset: navigation.offset - 1 })
  }
  // Do not cancel the first pending song when there is no earlier target.
  if (store.pendingCurrent) return
  const generation = beginPlaybackIntent()
  return queueMutations.run(async () => {
    await guarded(generation, () => ensurePlayer())
    usePlayerStore.getState().setPlaybackEnded(false)
    await nativeCommand(generation, () => TrackPlayer.seekTo(0))
    await guarded(generation, () => playWithNetworkPolicy(generation))
  }, { label: '回到歌曲开头' }).catch(ignoreSuperseded)
}

async function selectPreviousItems(provider: MusicProvider, navigation: PendingNavigation): Promise<void> {
  const originals = navigation.history.slice(navigation.history.length + navigation.offset)
  const items = originals.map((item) => ({ ...item, qid: nextQueueId(item.serverId, item.trackId) }))
  const current = items[0]
  if (!current) return
  const selection = { items, historyIds: originals.map((item) => item.qid) }
  const generation = beginPlaybackIntent()
  pendingNavigation = navigation
  usePlayerStore.getState().setPendingCurrent(current)
  setLoadingForGeneration(generation, true)
  return queueMutations.run(async () => {
    await guarded(generation, () => ensurePlayer())
    const tracks = await Promise.all(items.map((item, index) => toRntpTrack(item, provider, { allowTranscode: index === 0, generation })))
    checkGeneration(generation)
    pendingPreviousActivation = { qid: current.qid, selection }
    try {
      await nativeCommand(generation, () => tracks.length === 1 ? TrackPlayer.add(tracks[0]!, 0) : TrackPlayer.add(tracks, 0))
      await skipToNativeQueueTrack(generation, current.qid)
    } catch (error) {
      // An obsolete add may have reached RNTP. Remove only this attempt's unique
      // occurrences, without touching the latest target or its history.
      void removeAbandonedPreviousItems(items.map((item) => item.qid))
      checkGeneration(generation)
      pendingPreviousActivation = undefined
      throw error
    }
    if (usePlayerStore.getState().queue[0]?.qid !== current.qid) {
      usePlayerStore.getState().restorePreviousTracks(selection.items, selection.historyIds)
    }
    pendingPreviousActivation = undefined
    finishNavigation(generation)
    await guarded(generation, () => playWithNetworkPolicy(generation))
  }, { label: '上一首' }).catch(ignoreSuperseded).finally(() => {
    finishNavigation(generation)
    setLoadingForGeneration(generation, false)
  })
}

/** Cleanup survives further taps: these unique attempt ids must not auto-play later. */
async function removeAbandonedPreviousItems(ids: string[]): Promise<void> {
  try {
    await runNativeCommit(async (epoch) => {
      const queue = await TrackPlayer.getQueue()
      if (epoch !== nativeCommitEpoch) return
      const committed = new Set(usePlayerStore.getState().queue.map((item) => item.qid))
      const indexes = queue.flatMap((item, index) =>
        typeof item.id === 'string' && ids.includes(item.id) && !committed.has(item.id) ? [index] : [],
      )
      if (indexes.length > 0) await TrackPlayer.remove(indexes)
    }, '清理已取消的上一首')
  } catch (error) {
    console.warn('清理已取消的上一首失败', error)
  }
}

export async function skipToNextSafe(): Promise<void> {
  if (loadingListInput) {
    const input = loadingListInput
    const next = Math.min(input.startIndex + 1, input.tracks.length - 1)
    if (next <= input.startIndex) return
    return playTrackList({ ...input, startIndex: next })
  }
  // Search/single-track playback must not borrow the old queue's upcoming songs.
  if (!pendingNavigation && usePlayerStore.getState().pendingCurrent) return
  const navigation = navigationFromStore()
  const next = { ...navigation, offset: navigation.offset + 1 }
  if (next.offset < 0) {
    if (activeProvider) return selectPreviousItems(activeProvider, next)
    return
  }
  const target = next.queue[next.index + next.offset]
  if (target) return selectQueuedItem(target, next)
}

async function selectQueuedItem(target: QueueItem, navigation: PendingNavigation): Promise<void> {
  // Native buffering is independent of isLoadingAudio: every tap is a new intent.
  const generation = beginPlaybackIntent()
  pendingNavigation = navigation
  usePlayerStore.getState().setPendingCurrent(target)
  setLoadingForGeneration(generation, true)
  return queueMutations.run(async () => {
    await guarded(generation, () => ensurePlayer())
    await skipToNativeQueueTrack(generation, target.qid)
    // Activation events may arrive after buffering. Commit by identity now if
    // the bridge has not already done so, with the same history/queue semantics.
    const latest = usePlayerStore.getState()
    const targetIndex = latest.queue.findIndex((entry) => entry.qid === target.qid)
    if (targetIndex >= 0 && targetIndex !== latest.index) {
      const leaving = latest.queue[latest.index]
      latest.activateIndex(targetIndex)
      if (leaving) {
        if (latest.playMode.repeat === 'queue') {
          void cycleCurrentToQueueEnd(leaving).catch((error: unknown) => console.warn('循环队列更新失败', error))
        } else {
          void removeConsumedNativeTrack(leaving.qid)
        }
      }
    }
    finishNavigation(generation)
    // Never hold the native commit queue while play waits for network buffering.
    await guarded(generation, () => playWithNetworkPolicy(generation))
  }, { label: '切换歌曲' }).catch(ignoreSuperseded).finally(() => {
    finishNavigation(generation)
    setLoadingForGeneration(generation, false)
  })
}

/** 待播列表点某一行：只取出选中项成为当前，其他待播顺序保持不变。 */
export async function skipToIndex(index: number): Promise<void> {
  setPlaybackIntent(true)
  const generation = playbackGeneration.capture()
  if (index <= 0) return
  await guarded(generation, () => ensurePlayer())
  try {
    const target = usePlayerStore.getState().queue[index]
    if (!target) return
    await skipToNativeQueueTrack(generation, target.qid)
    await guarded(generation, () => playWithNetworkPolicy(generation))
  } catch (error) {
    if (error instanceof Error && error.name === 'PlaybackNetworkBlocked') throw error
    // 下标越界（队列刚被改过）时忽略
  }
}

/** 历史点播创建新 occurrence；历史日志和待播列表都保持不变。 */
export function playHistoryItem(item: QueueItem): Promise<void> {
  const generation = beginPlaybackIntent()
  const provider = activeProvider
  if (!provider) return Promise.resolve()
  return queueMutations.run(async () => {
    await guarded(generation, () => ensurePlayer())
    const selected = { ...item, qid: nextQueueId(item.serverId, item.trackId) }
    const track = await toRntpTrack(selected, provider, { allowTranscode: true, generation })
    pendingHistoryActivation = { qid: selected.qid, item }
    try {
      await nativeCommand(generation, () => TrackPlayer.add(track, 0))
      await skipToNativeQueueTrack(generation, selected.qid)
      await guarded(generation, () => playWithNetworkPolicy(generation))
    } catch (error) {
      pendingHistoryActivation = undefined
      throw error
    }
  }, { label: '历史点播' }).catch(ignoreSuperseded)
}

/** 队列页拖动排序：先改播放器队列，再同步本地展示顺序 */
async function moveInQueueMutation(from: number, to: number, generation: number): Promise<void> {
  if (from === to) return
  await guarded(generation, () => ensurePlayer())
  try {
    await nativeCommand(generation, () => TrackPlayer.move(from, to))
  } catch {
    return
  }
  usePlayerStore.getState().moveItem(from, to)
  schedulePrefetch(usePlayerStore.getState().index)
}

export function moveInQueue(from: number, to: number): Promise<void> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => moveInQueueMutation(from, to, generation), { label: '队列排序' }).catch(ignoreSuperseded)
}

/** 队列页删除一首；当前播放那首不允许删（避免打断播放） */
async function removeFromQueueMutation(index: number, generation: number): Promise<void> {
  const { index: current } = usePlayerStore.getState()
  if (index === current) return
  await guarded(generation, () => ensurePlayer())
  try {
    await nativeCommand(generation, () => TrackPlayer.remove([index]))
  } catch {
    return
  }
  usePlayerStore.getState().removeItem(index)
  schedulePrefetch(usePlayerStore.getState().index)
}

export function removeFromQueue(index: number): Promise<void> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => removeFromQueueMutation(index, generation), { label: '移除队列曲目' }).catch(ignoreSuperseded)
}

/** 清空独立历史日志，不修改 RNTP 当前曲目或待播队列。 */
async function clearHistoryMutation(): Promise<void> {
  usePlayerStore.getState().clearHistory()
}

export function clearHistory(): Promise<void> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => guarded(generation, clearHistoryMutation), { label: '清空历史' }).catch(ignoreSuperseded)
}

/** 历史行左滑删除单条。与「清空历史」共用同一条 mutation 队列，避免交错改同一份历史。 */
export function removeHistoryItem(qid: string): Promise<void> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(
    async () => {
      checkGeneration(generation)
      usePlayerStore.getState().removeHistoryItem(qid)
    },
    { label: '删除历史记录' },
  ).catch(ignoreSuperseded)
}

/** 清空队列并停止播放；转码会话必须显式退出，否则服务端会留着转码进程 */
async function clearQueueMutation(generation: number): Promise<void> {
  checkGeneration(generation)
  prefetchToken += 1
  resetForcedTranscode()
  resetRadioSession()
  resetListFeed()
  // 在途的转码产物缓存也要停：清队列之后它已经没有意义，还会白占带宽
  abortTranscodeCaching()
  // Local heartbeat teardown must not depend on native player setup succeeding.
  await stopTranscodeSession(undefined, () => playbackGeneration.isCurrent(generation))
  await clearWarmTranscode()
  await guarded(generation, () => ensurePlayer())
  await nativeCommand(generation, () => TrackPlayer.reset())
  usePlayerStore.getState().clear()

}

export function clearQueue(): Promise<void> {
  invalidatePlaybackIntents()
  const generation = playbackGeneration.capture()
  const snapshotCleared = clearPlaybackSnapshot()
  const nativeCleared = queueMutations.run(() => clearQueueMutation(generation), { label: '清空队列' }).catch(ignoreSuperseded)
  return Promise.all([snapshotCleared, nativeCleared]).then(() => undefined)
}

/**
 * 清空待播列表：只移除当前曲目之后的部分，**不打断正在播放的这首**。
 *
 * 与 clearQueue 的区别是刻意的：队列页「继续播放」分区上的清空按钮如果顺手把
 * 当前曲目也停掉，用户会以为误触了「停止」。清空整个队列的场景（退出登录等）
 * 走 clearQueue。
 */
async function clearUpcomingMutation(generation: number): Promise<void> {
  const { queue, index } = usePlayerStore.getState()
  const upcomingCount = index >= 0 ? queue.length - index - 1 : queue.length
  if (upcomingCount <= 0) return
  // 漫游游标指向队尾那首，待播被清空后游标已失效；
  // 不复位的话「无限播放」会从旧游标继续往后取，等于清了个寂寞
  resetRadioSession()
  prefetchToken += 1
  await guarded(generation, () => ensurePlayer())
  // RNTP 队列与 store 一一对应，移除区间就是 index+1 到末尾
  const start = index >= 0 ? index + 1 : 0
  const indexes = Array.from({ length: upcomingCount }, (_, offset) => start + offset)
  try {
    await nativeCommand(generation, () => TrackPlayer.remove(indexes))
  } catch {
    // 队列刚被其他操作改过：放弃本次，UI 会照常显示真实状态
    return
  }
  usePlayerStore.getState().clearUpcoming()
  schedulePrefetch(usePlayerStore.getState().index)
}

export function clearUpcoming(): Promise<void> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => clearUpcomingMutation(generation), { label: '清空待播' }).catch(ignoreSuperseded)
}

const REPEAT_ORDER: RepeatMode[] = ['off', 'queue', 'one']

export async function cycleRepeat(): Promise<RepeatMode> {
  const generation = playbackGeneration.capture()
  const current = usePlayerStore.getState().playMode.repeat
  const next = REPEAT_ORDER[(REPEAT_ORDER.indexOf(current) + 1) % REPEAT_ORDER.length]!
  try {
    await guarded(generation, () => ensurePlayer())
    await nativeCommand(generation, () => TrackPlayer.setRepeatMode(
      next === 'one' ? RntpRepeatMode.Track : next === 'queue' ? RntpRepeatMode.Queue : RntpRepeatMode.Off,
    ))
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
async function setShuffledOrderMutation(shuffle: boolean, generation: number): Promise<void> {
  await guarded(generation, () => ensurePlayer())
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
    await reorderRntpUpcoming(start, tail, queue, generation)
  } catch (error) {
    // 重排是用户主动操作，失败要有日志；开关已翻转，不会卡住
    console.warn('随机播放重排失败', error)
    return
  }
  // RNTP 队列已就位；期间没有新的切歌/追加才同步展示顺序
  const latest = usePlayerStore.getState()
  if (latest.queue !== queue) return
  latest.reorder([...head, ...tail], index)
  schedulePrefetch(latest.index)
}

/**
 * 用 RNTP 的 move 把「当前曲目之后」的原生队列重排成 tail 的顺序。
 * RNTP 队列与 store 一一对应，current 是操作开始时的快照（与 tail 同源）。
 */
async function reorderRntpUpcoming(start: number, tail: QueueItem[], current: QueueItem[], generation: number): Promise<void> {
  const currentTail = current.slice(start)
  const moves = planTailReorder(currentTail, tail, (item) => item.qid)
  for (const [fromOffset, toOffset] of moves) {
    await nativeCommand(generation, () => TrackPlayer.move(start + fromOffset, start + toOffset))
  }
}

export function setShuffledOrder(shuffle: boolean): Promise<void> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => setShuffledOrderMutation(shuffle, generation), { label: '随机播放重排' }).catch(ignoreSuperseded)
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
  const generation = playbackGeneration.capture()
  const session = radioSession
  if (!radioCursor) {
    const slice = await provider.radioStart()
    if (!playbackGeneration.isCurrent(generation) || session !== radioSession) return
    const committed = await queueMutations.run(() => appendTracksMutation({ provider, serverId, tracks: [slice.current] }, generation))
    if (!committed || !playbackGeneration.isCurrent(generation) || session !== radioSession) return
    radioCursor = slice.cursor
  }
  await fillRadio(provider, serverId)
}

/** 随机播放与预取都要用 provider 重新生成播放地址，这里保存最近一次使用的实例 */
let activeProvider: MusicProvider | null = null
let pendingHistoryActivation: { qid: string; item: QueueItem } | undefined
let pendingPreviousActivation: { qid: string; selection: { items: QueueItem[]; historyIds: string[] } } | undefined

export function takePendingHistoryActivation(qid: string): QueueItem | undefined {
  if (pendingHistoryActivation?.qid !== qid) return undefined
  const item = pendingHistoryActivation.item
  pendingHistoryActivation = undefined
  return item
}

export function takePendingPreviousActivation(qid: string): { items: QueueItem[]; historyIds: string[] } | undefined {
  if (pendingPreviousActivation?.qid !== qid) return undefined
  const selection = pendingPreviousActivation.selection
  pendingPreviousActivation = undefined
  return selection
}
/** 每次切歌都会重排预取顺序，旧的循环靠这个令牌自行退出 */
let prefetchToken = 0
const pendingWarmPreparations = new Map<string, Promise<StreamRequest | undefined>>()

function prepareWarmTranscode(item: QueueItem, provider: MusicProvider, quality: StreamQuality): Promise<StreamRequest | undefined> {
  const warmed = getWarmTranscode(item.qid)
  if (warmed) return Promise.resolve(warmed)
  const pending = pendingWarmPreparations.get(item.qid)
  if (pending) return pending
  const isStillNext = () => {
    const { queue, index } = usePlayerStore.getState()
    return canUsePlaybackNetwork() && queue[index + 1]?.qid === item.qid
  }
  const promise = provider.stream(item.trackId, { quality, allowTranscode: true })
    .then(async (stream) => {
      if (!isStillNext()) {
        await stream.session?.close().catch(() => undefined)
        return undefined
      }
      return setWarmTranscode(item.qid, stream, isStillNext)
    })
    .catch(() => undefined)
    .finally(() => {
      if (pendingWarmPreparations.get(item.qid) === promise) pendingWarmPreparations.delete(item.qid)
    })
  pendingWarmPreparations.set(item.qid, promise)
  return promise
}


export function rememberProvider(provider: MusicProvider | null): void {
  activeProvider = provider
  if (!provider) {
    prefetchToken += 1
    resetForcedTranscode()
    resetRadioSession()
    resetListFeed()
    abortTranscodeCaching()
    void clearWarmTranscode()
  }
}

/**
 * 立即撤销所有在途播放任务的写权限，并清掉本地播放器镜像。
 * 登出/切换账号先调用它；耗时的 RNTP reset、转码 quit 和快照清理随后尽力执行，
 * 迟到的网络结果不能再把旧账号的队列写回来。
 */
export function invalidatePlaybackIntents(): void {
  beginPlaybackIntent(false)
  loadingListInput = undefined
  loadingPlaybackGeneration = undefined
  prefetchToken += 1
  resetRadioSession()
  resetListFeed()
  usePlayerStore.getState().clear()
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
  if (!resolveLocalPlaybackResource(item) && !shouldTranscode(item) && await getStreamQuality() === 'original') {
    await stopTranscodeSession(undefined, () => playbackGeneration.isCurrent(generation))
    return
  }
  if (hasTranscodeSession(item.qid)) {
    const active = await guarded(generation, () => TrackPlayer.getActiveTrack())
    const local = resolveLocalPlaybackResource(item)
    if (active?.id !== item.qid || !local || active.url !== local.url) return
    await stopTranscodeSession(undefined, () => playbackGeneration.isCurrent(generation))
  }

  const base = {
    id: item.qid,
    title: item.title,
    artist: item.artistText,
    ...(item.albumText ? { album: item.albumText } : {}),
    duration: item.durationMs / 1000,
  }

  /**
   * 命中转码产物缓存 → 直接播本地文件。
   * 既不用起转码会话（省掉心跳保活），NAS 也不必再把这首转一遍。
   * 文件是 fragmented MP4（内含 FLAC），所以后缀与 contentType 都按 mp4 给 ——
   * 实测后缀不对时 AVFoundation 会直接拒绝播放（见 audio-cache-policy.ts 的说明）。
   */
  const localResource = resolveLocalPlaybackResource(item)
  if (localResource) {
    const active = await guarded(generation, () => TrackPlayer.getActiveTrack())
    if (active?.id !== item.qid) return
    const needsLocalRebind = active?.id === item.qid
      && active.url !== localResource.url
      && (!canUsePlaybackNetwork() || shouldTranscode(item))
    if (!needsLocalRebind) {
      if (hasTranscodeSession(item.qid) && localResource.kind !== 'transcode') return
      if (active?.id === item.qid && active.url === localResource.url) {
        await stopTranscodeSession(undefined, () => playbackGeneration.isCurrent(generation))
        return
      }
      if (!shouldTranscode(item) && canUsePlaybackNetwork()) {
        await stopTranscodeSession(undefined, () => playbackGeneration.isCurrent(generation))
        return
      }
    }
    usePlayerStore.getState().setIsLoadingAudio(true)
    try {
      // 本地文件不需要会话；把可能还活着的旧会话收掉，别让服务端留着转码进程
      await stopTranscodeSession(undefined, () => playbackGeneration.isCurrent(generation))
      const latest = await guarded(generation, () => TrackPlayer.getActiveTrack())
      if (latest?.id !== item.qid) return
      const position = (await guarded(generation, () => TrackPlayer.getProgress())).position
      if (latest.url !== localResource.url) {
        await nativeCommand(generation, () => TrackPlayer.load({
          ...base,
          url: localResource.url,
          ...(localResource.contentType ? { contentType: localResource.contentType } : {}),
        }))
      }
      if (position > 1) await nativeCommand(generation, () => TrackPlayer.seekTo(position))
      if (options.resumePlayback !== false) await guarded(generation, () => playWithNetworkPolicy(generation))
    } finally {
      setLoadingForGeneration(generation, false)
    }
    return
  }

  usePlayerStore.getState().setIsLoadingAudio(true)
  try {
    await guarded(generation, requirePlaybackNetwork)
    const position = (await guarded(generation, () => TrackPlayer.getProgress())).position
    const stream = (await takeWarmTranscode(item.qid))
      ?? (await provider.stream(item.trackId, { quality: await getStreamQuality(), allowTranscode: true }))
    if (!playbackGeneration.isCurrent(generation) || usePlayerStore.getState().queue[index]?.qid !== item.qid) {
      await stream.session?.close().catch(() => undefined)
      return
    }
    if (stream.session) await replaceTranscodeSession(item.qid, stream.session, () => playbackGeneration.isCurrent(generation))
    else await stopTranscodeSession(undefined, () => playbackGeneration.isCurrent(generation))
    await nativeCommand(generation, () => TrackPlayer.load({
      ...base,
      url: stream.url,
      headers: stream.headers,
      ...(stream.transport === 'hls' ? { type: TrackType.HLS } : {}),
    }))
    /**
     * 后台把这次的转码产物缓存成单文件（fire-and-forget，不 await）。
     *
     * 服务端转码**没有任何缓存** —— 同一首 WMA 每播一次 NAS 就要重转一次。
     * 缓存成功后下次直接播本地（上面的 cachedTranscodeUri 分支），顺带获得离线能力。
     * 失败只 warn，绝不影响正在播放的这首。
     */
    cacheHlsStream(item, stream)
    // 保留已播进度（原生播放失败重试时用得上）
    if (position > 1) await nativeCommand(generation, () => TrackPlayer.seekTo(position))
    if (options.resumePlayback !== false) await guarded(generation, () => playWithNetworkPolicy(generation))
  } finally {
    setLoadingForGeneration(generation, false)
  }
}

export function ensureTranscodeForIndex(index: number, options?: { resumePlayback?: boolean }): Promise<void> {
  const generation = playbackGeneration.capture()
  return queueMutations.run(() => ensureTranscodeForIndexMutation(index, generation, options), {
    label: '切换转码会话',
  }).catch(ignoreSuperseded)
}

/**
 * 把当前这首和后两首放进播放缓存。当前那首本次仍然走网络直连
 * （不等下载完，起播不能变慢），缓存是为了下次听得更快、离线也能听。
 */
export function schedulePrefetch(index: number): void {
  const provider = activeProvider
  if (!provider || index < 0) return
  const { queue } = usePlayerStore.getState()

  prefetchToken += 1
  const token = prefetchToken
  const cacheGeneration = captureAudioCacheGeneration()
  void (async () => {
    const quality = await getStreamQuality()
    if (token !== prefetchToken) return
    const latest = usePlayerStore.getState()
    const currentIndex = latest.queue.findIndex((item) => item.qid === queue[index]?.qid)
    if (currentIndex < 0) return
    const liveQueue = latest.queue
    const previous = latest.history.at(-1)
    const next = liveQueue[currentIndex + 1]
    const candidates = [next, liveQueue[currentIndex], previous, liveQueue[currentIndex + 2]]
      .filter((item): item is QueueItem => Boolean(item))
      .filter((item, position, all) => all.findIndex((entry) => entry.qid === item.qid) === position)
    protectTracks(candidates.map(toCacheTarget))

    // Cache files may have completed while a queue edit invalidated the old
    // scheduling window. Promote any still-upcoming occurrence before skipping it.
    const currentGeneration = playbackGeneration.capture()
    for (const item of candidates) {
      if (token !== prefetchToken) return
      if (resolveLocalPlaybackResource(item)) {
        await promoteQueuedLocalSource(currentGeneration, item.qid).catch(() => false)
      }
    }

    const nextTranscode = liveQueue[currentIndex + 1]
    const shouldPrewarm = nextTranscode ? shouldTranscode(nextTranscode) || quality !== 'original' : false
    const warmTask = (async () => {
      if (!canUsePlaybackNetwork()) {
        await clearWarmTranscode()
        return
      }
      if (nextTranscode && shouldPrewarm && !resolveLocalPlaybackResource(nextTranscode)) {
        try {
          const adopted = await prepareWarmTranscode(nextTranscode, provider, quality)
          if (adopted && isAutoCacheEnabled()) {
            cacheHlsStream(nextTranscode, adopted)
          }
        } catch {
          // 预热失败不影响当前播放，切过去时仍会按原流程即时创建。
        }
      } else {
        await clearWarmTranscode()
      }
    })()

    // The next original file starts beside the current download. Keep at most
    // two provider/cache pipelines active, with next/current/previous/next2 order.
    const fileTargets = isAutoCacheEnabled() && quality === 'original'
      ? candidates.filter((item) => !shouldTranscode(item))
      : []
    let cursor = 0
    const cacheWorker = async () => {
      while (cursor < fileTargets.length) {
        const item = fileTargets[cursor++]!
        if (token !== prefetchToken || !canUsePlaybackNetwork() || !isAudioCacheGenerationCurrent(cacheGeneration) || !isAutoCacheEnabled()) return
        const target = toCacheTarget(item)
        if (resolveLocalPlaybackResource(item)) continue
        try {
          const stream = await provider.stream(item.trackId, { quality, allowTranscode: false })
          if (token !== prefetchToken || !canUsePlaybackNetwork() || !isAudioCacheGenerationCurrent(cacheGeneration) || !isAutoCacheEnabled()) return
          await cacheAudio(target, { url: stream.url, headers: stream.headers }, {
            shouldAbort: () => token !== prefetchToken
              || !canUsePlaybackNetwork()
              || !isAudioCacheGenerationCurrent(cacheGeneration)
              || !isAutoCacheEnabled(),
          })
          if (token !== prefetchToken || !isAudioCacheGenerationCurrent(cacheGeneration)) return
          if (usePlayerStore.getState().queue.some((queued) => queued.qid === item.qid)) {
            await promoteQueuedLocalSource(playbackGeneration.capture(), item.qid).catch(() => false)
          }
        } catch {
          // 预取失败不影响播放，下次调度会重试。
        }
      }
    }
    await Promise.all([warmTask, cacheWorker(), cacheWorker()])
  })()
}

// ---- 冷启动恢复上次会话 ----

/**
 * 恢复期间关掉「上报起播」：重建队列会触发换歌事件，但用户还没真的在听。
 * RNTP 的事件是异步派发的，解除抑制要晚一点（finally 里 setTimeout）。
 */
let suppressingReports = false
let reportSuppressionRevision = 0

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
  const generation = playbackGeneration.capture()
  const hydrateArtwork = (item: QueueItem): QueueItem =>
    item.coverId ? { ...item, artwork: provider.image(item.coverId, ARTWORK_SIZE) } : item
  const items = snapshot.queue.map(hydrateArtwork)
  const historyItems = snapshot.history.map(hydrateArtwork)
  const baseItems = snapshot.baseQueue.map(hydrateArtwork)
  if (items.length === 0) return false
  await guarded(generation, () => ensurePlayer())

  // 恢复是异步的：等 ensurePlayer 的工夫里用户（或某条自动化）可能已经
  // 开始放新队列了，那就别用旧会话把正在放的顶掉
  if (usePlayerStore.getState().queue.length > 0) return false

  const suppressionRevision = ++reportSuppressionRevision
  suppressingReports = true
  try {
    const index = Math.min(Math.max(snapshot.index, 0), items.length - 1)
    const rntpTracks = await Promise.all(
      items.map((item, itemIndex) => toRntpTrack(item, provider, { allowTranscode: itemIndex === index, generation })),
    )
    checkGeneration(generation)
    // 转码 / 鉴权等网络步骤也可能耗时，回到主线程前再查一次
    if (usePlayerStore.getState().queue.length > 0) return false
    await nativeCommand(generation, () => TrackPlayer.reset())
    await nativeCommand(generation, () => TrackPlayer.add(rntpTracks))
    // 循环模式直接给原生播放器，别等用户去队列页点
    await nativeCommand(generation, () => TrackPlayer.setRepeatMode(
      snapshot.playMode.repeat === 'one'
        ? RntpRepeatMode.Track
        : snapshot.playMode.repeat === 'queue'
          ? RntpRepeatMode.Queue
          : RntpRepeatMode.Off,
    ))
    if (index > 0) await nativeCommand(generation, () => TrackPlayer.skip(index))
    const position = snapshot.position ?? 0
    if (position > 1) await nativeCommand(generation, () => TrackPlayer.seekTo(position))

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
    await nativeCommand(generation, () => TrackPlayer.pause())

    // 换歌事件异步到来时 store 已就位，refetch 封面与预取照常跑
    void refreshArtwork(index)
    void refreshArtist(index)
    schedulePrefetch(index)
    return true
  } catch (error) {
    if (error instanceof SupersededPlayback) return false
    throw error
  } finally {
    setTimeout(() => {
      if (suppressionRevision === reportSuppressionRevision) suppressingReports = false
    }, 1500)
  }
}
