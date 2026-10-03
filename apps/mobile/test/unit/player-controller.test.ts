vi.mock('@/player/network-access', () => ({ requirePlaybackNetwork: vi.fn(async () => undefined), canUsePlaybackNetwork: () => true }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaySource, QueueItem, Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'

/**
 * `src/player/controller.ts`（957 行，播放核心）的**行为**测试。
 *
 * ── 为什么以前一条都没有 ────────────────────────────────────────────────────
 * 这个模块在顶层 import 了 react-native-track-player 与一串 expo 模块，
 * 而且（通过 audio-cache）间接依赖 `@/` 路径别名 —— 而 vitest 默认不读
 * tsconfig 的 paths。所以它**根本 import 不进来**，不是没人写测试，是写不了。
 * 配套修的是 `vitest.config.mts`（把 tsconfig 的 paths 镜像给 vitest）。
 *
 * ── 测试策略 ────────────────────────────────────────────────────────────────
 * 只替身**平台边界**（原生播放器 / expo 模块），store 用真实的
 * `usePlayerStore`，这样断言的是「真的改了队列」，不是「调了某个 mock」。
 * 断言重点放在 index 运算与「原生失败时 store 不能动」这类同步不变量上 ——
 * 这两类错误不会崩，只会静默放错歌。
 */

// ── 平台替身 ────────────────────────────────────────────────────────────────

/** 推给原生播放器的曲目：`id` 就是 qid，`url` 是播放地址 */
type AddedTrack = { id: string; url?: string }

// 参数签名显式写出来：部分用例要读 `mock.calls` 里的实参（如 move 的 from/to），
// 无参的 `vi.fn(async () => ...)` 会把 calls 推成空元组，读出来是 never。
const rntp = vi.hoisted(() => ({
  getActiveTrack: vi.fn<() => Promise<AddedTrack | undefined>>(async () => undefined),
  getQueue: vi.fn<() => Promise<AddedTrack[]>>(async () => []),
  move: vi.fn<(from: number, to: number) => Promise<void>>(async () => undefined),
  remove: vi.fn<(indexes: number[]) => Promise<void>>(async () => undefined),
  reset: vi.fn<() => Promise<void>>(async () => undefined),
  setRepeatMode: vi.fn<(mode: number) => Promise<void>>(async () => undefined),
  // 实参有**两种形状**：批量入队传数组（playTrackList / appendTracks / playNext），
  // 单曲入队传对象（skipToPreviousSmart、cycleCurrentToQueueEnd）。
  // 签名要如实写出来，否则读 mock.calls 拿到的是 never。
  add: vi.fn<(tracks: AddedTrack | AddedTrack[], position?: number) => Promise<void>>(
    async () => undefined,
  ),
  skip: vi.fn<(index: number) => Promise<void>>(async () => undefined),
  skipToNext: vi.fn<() => Promise<void>>(async () => undefined),
  play: vi.fn<() => Promise<void>>(async () => undefined),
  seekTo: vi.fn<(seconds: number) => Promise<void>>(async () => undefined),
  getActiveTrackIndex: vi.fn<() => Promise<number>>(async () => 0),
  updateMetadataForTrack: vi.fn<(index: number, metadata: Record<string, unknown>) => Promise<void>>(async () => undefined),
}))

const setup = vi.hoisted(() => ({ ensurePlayer: vi.fn(async () => undefined) }))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('react-native-track-player', () => ({
  default: rntp,
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
  TrackType: { Default: 'default', HLS: 'hls' },
}))
vi.mock('expo-file-system', () => ({}))
vi.mock('expo-secure-store', () => ({}))
vi.mock('expo-network', () => ({}))
vi.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) }))

// ensurePlayer 会真的去 setupPlayer；单测里它只需要是个成功的空操作
vi.mock('../../src/player/setup', () => setup)

// 下面几个只为了「模块能加载」+ 不在单测里碰真实 I/O
vi.mock('../../src/player/persist', () => ({
  clearPlaybackSnapshot: vi.fn(async () => undefined),
  readPlaybackSnapshot: vi.fn(async () => null),
}))
vi.mock('../../src/player/transcode-cache', () => ({
  abortTranscodeCaching: vi.fn(),
  cachedTranscodeUri: vi.fn(() => undefined),
  startTranscodeCaching: vi.fn(),
}))
vi.mock('../../src/player/transcode-prewarm', () => ({
  clearWarmTranscode: vi.fn(async () => undefined),
  setWarmTranscode: vi.fn(),
  takeWarmTranscode: vi.fn(() => undefined),
}))
vi.mock('../../src/player/transcode-session', () => ({
  hasTranscodeSession: vi.fn(() => false),
  replaceTranscodeSession: vi.fn(),
  startTranscodeSession: vi.fn(),
  stopTranscodeSession: vi.fn(async () => undefined),
}))

const {
  appendTracks,
  clearForcedTranscode,
  clearQueue,
  clearUpcoming,
  cycleCurrentToQueueEnd,
  cycleRepeat,
  fillFromListFeed,
  hasPendingListFeed,
  markForcedTranscode,
  moveInQueue,
  playNext,
  playSingleTrack,
  playTrackList,
  rememberProvider,
  refreshArtist,
  removeFromQueue,
  setShuffledOrder,
  shouldTranscode,
  skipToIndex,
  skipToNextSafe,
  skipToPreviousSmart,
  takePendingPreviousActivation,
  toQueueItem,
  toggleShuffle,
} = await import('../../src/player/controller')
const { usePlayerStore } = await import('../../src/player/store')

// ── 夹具 ────────────────────────────────────────────────────────────────────

/**
 * 每个 qid 都带自增序号：`controller.ts` 里的 `forcedTranscode` 是**模块级 Set**，
 * 唯一的重置入口是 `clearQueue()`。如果多个用例复用同一个 qid，
 * 标记会跨用例泄漏，测试就变成「看执行顺序决定成败」。
 * 用唯一 qid 让每个用例互不干扰。
 */
let seq = 0

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function item(id: string, format?: string): QueueItem {
  seq += 1
  return {
    qid: `srv:${id}:${seq}`,
    serverId: 'srv',
    trackId: id,
    title: `曲目 ${id}`,
    artistText: '测试艺术家',
    durationMs: 180_000,
    ...(format ? { format } : {}),
  }
}

const ids = ['a', 'b', 'c', 'd']

/** 装入 a/b/c/d 并把 index 指到第 index 项 */
function loadQueue(index: number): void {
  usePlayerStore.getState().setQueue(ids.map((id) => item(id)), index, {
    kind: 'tracks',
    label: '全部歌曲',
  })
}

function queueIds(): string[] {
  return usePlayerStore.getState().queue.map((entry) => entry.trackId)
}

/** 只装给定的几首，用于「队列只剩一首」这类边界 */
function loadQueueOf(trackIds: string[], index: number): void {
  usePlayerStore.getState().setQueue(trackIds.map((id) => item(id)), index, {
    kind: 'tracks',
    label: '全部歌曲',
  })
}

/**
 * 播放地址由 provider 现场生成，测试里给个最小可用实现。
 *
 * `capabilities.qualityTiers: false` 是刻意给的：`getStreamQuality()` 里读的是
 * `activeProvider?.capabilities.qualityTiers ?? false` —— 少了 capabilities 这一层
 * 会直接抛 TypeError（可选链只兜住 activeProvider 为 null，兜不住它下面缺字段），
 * 而不是安静地回退到 original。所以这个字段是「provider 形状」的一部分。
 */
function fakeProvider(): MusicProvider {
  return {
    capabilities: { qualityTiers: false },
    stream: async (trackId: string) => ({ url: `stream://${trackId}` }),
    // toQueueItem 在有封面时会调它算鉴权地址，缺了会直接抛
    image: (coverId: string, size?: number) => ({ url: `img://${coverId}`, size }),
  } as unknown as MusicProvider
}

/** 领域曲目夹具；`format` 决定要不要走转码 */
let trackSeq = 0
function makeTrack(id: string, format = 'flac'): Track {
  trackSeq += 1
  return {
    id,
    title: `曲目 ${id}`,
    durationMs: 180_000,
    artists: [{ id: `ar-${trackSeq}`, name: '测试艺术家' }],
    genres: [],
    isCue: false,
    isFavorite: false,
    album: { id: 'al-1', name: '专辑' },
    audio: { format, sizeBytes: 1024 },
  }
}

/**
 * 把 move 的调用序列在本地重放一遍，得到「原生队列的最终顺序」。
 *
 * 用来交叉核对 store 的展示顺序与下发给播放器的指令是否一致：这两端一旦错位
 * 不会报错，只会静默放错歌 —— 正是这个模块历史上最容易出的那类问题。
 * RNTP 的 move 每执行一次，被跨过的项会整体平移，所以要边挪边跟踪。
 */
function applyMoves(startTail: string[], start: number, calls: [number, number][]): string[] {
  const order = [...startTail]
  for (const [from, to] of calls) {
    const moved = order.splice(from - start, 1)[0]
    if (moved === undefined) continue
    order.splice(to - start, 0, moved)
  }
  return order
}

/**
 * `add` 的实参有两种形状，读的时候统一成数组，免得每个用例各判一次。
 * 越界返回空数组，让断言直接失败而不是抛 TypeError。
 */
function addedTracks(callIndex = 0): AddedTrack[] {
  const arg = rntp.add.mock.calls[callIndex]?.[0]
  if (arg === undefined) return []
  return Array.isArray(arg) ? arg : [arg]
}

/**
 * 断言这次 `add` 收到的是**单曲**。
 * 单曲接口被传成数组是个真实存在的错误形态（原生会当成一首名叫 "[object Object]" 的歌），
 * 所以这里不静默兼容，直接抛。
 */
function addedSingleTrack(callIndex = 0): AddedTrack {
  const arg = rntp.add.mock.calls[callIndex]?.[0]
  if (arg === undefined || Array.isArray(arg)) {
    throw new Error(`期望 add 收到单曲，实际是 ${Array.isArray(arg) ? '数组' : String(arg)}`)
  }
  return arg
}

/** `add` 的插入位置实参；批量入队时不传 */
function addPosition(callIndex = 0): number | undefined {
  return rntp.add.mock.calls[callIndex]?.[1]
}

beforeEach(() => {
  usePlayerStore.getState().clear()
  usePlayerStore.getState().setRepeat('off')
  // setQueue 不再强制关随机（第 9 轮：尊重用户随机开关），而 clear() 不碰 playMode——
  // 所以测试间 shuffle 会残留，这里显式归零避免用例相互污染。
  usePlayerStore.getState().setShuffle(false)
  // provider 是模块级状态：不归零的话，「上一个用例装过的 provider」会让本用例
  // 悄悄走上网址生成分支（顺带清掉 forcedTranscode 标记）
  rememberProvider(null)
  vi.clearAllMocks()
  // ensurePlayer 的默认实现被 clearAllMocks 清掉了，补回来
  setup.ensurePlayer.mockResolvedValue(undefined)
  for (const fn of [
    rntp.move,
    rntp.remove,
    rntp.reset,
    rntp.setRepeatMode,
    rntp.add,
    rntp.skip,
    rntp.skipToNext,
    rntp.play,
    rntp.seekTo,
    rntp.updateMetadataForTrack,
  ]) {
    fn.mockReset().mockResolvedValue(undefined)
  }
  rntp.getActiveTrackIndex.mockReset().mockResolvedValue(0)
  rntp.getActiveTrack.mockReset().mockImplementation(async () => {
    const { queue, index, pendingCurrent } = usePlayerStore.getState()
    const item = pendingCurrent ?? queue[index]
    return item ? { id: item.qid, url: 'https://example.test/audio' } : undefined
  })
  rntp.getQueue.mockReset().mockImplementation(async () => usePlayerStore.getState().queue.map((entry) => ({ id: entry.qid })))
})

// ── 转码判定 ────────────────────────────────────────────────────────────────

describe('shouldTranscode / 强制转码标记', () => {
  it('原生解不了的格式一律转码，原生能解的不转', () => {
    expect(shouldTranscode(item('a', 'dsf'))).toBe(true)
    expect(shouldTranscode(item('a', 'wma'))).toBe(true)
    expect(shouldTranscode(item('a', 'ape'))).toBe(true)
    expect(shouldTranscode(item('a', 'flac'))).toBe(false)
    expect(shouldTranscode(item('a', 'MP3'))).toBe(false)
  })

  it('格式未知时按原生播，等 PlaybackError 再兜底', () => {
    expect(shouldTranscode(item('a'))).toBe(false)
    expect(shouldTranscode(item('a', ''))).toBe(false)
  })

  it('标记过强制转码的曲目即使格式能解也走转码', () => {
    const track = item('a', 'flac')
    expect(shouldTranscode(track)).toBe(false)

    expect(markForcedTranscode(track.qid)).toBe(true)

    expect(shouldTranscode(track)).toBe(true)
  })

  it('重复标记返回 false，便于调用方只上报一次', () => {
    const track = item('a', 'flac')
    expect(markForcedTranscode(track.qid)).toBe(true)
    expect(markForcedTranscode(track.qid)).toBe(false)
    expect(markForcedTranscode(track.qid)).toBe(false)
  })

  it('曲目真的放出来后撤销标记，避免被永久钉在转码路径上', () => {
    const track = item('a', 'flac')
    markForcedTranscode(track.qid)

    clearForcedTranscode(track.qid)

    expect(shouldTranscode(track)).toBe(false)
    expect(markForcedTranscode(track.qid)).toBe(true)
  })

  it('标记按 qid 隔离，不影响同一 trackId 的其他出现', () => {
    const first = item('a', 'flac')
    const second = item('a', 'flac')

    markForcedTranscode(first.qid)

    expect(shouldTranscode(first)).toBe(true)
    expect(shouldTranscode(second)).toBe(false)
  })
})

// ── 清空待播 ────────────────────────────────────────────────────────────────

describe('clearUpcoming 只清当前之后的部分', () => {
  it('index 在中间时移除 index+1 到末尾', async () => {
    loadQueue(1)

    await clearUpcoming()

    expect(rntp.remove).toHaveBeenCalledWith([2, 3])
    expect(queueIds()).toEqual(['a', 'b'])
  })

  it('index 在最后一项时没有任何待播，不碰原生播放器', async () => {
    loadQueue(3)

    await clearUpcoming()

    expect(rntp.remove).not.toHaveBeenCalled()
    expect(queueIds()).toEqual(ids)
  })

  it('还没开始播放（index < 0）时整个队列都算待播', async () => {
    loadQueue(-1)

    await clearUpcoming()

    expect(rntp.remove).toHaveBeenCalledWith([0, 1, 2, 3])
    expect(queueIds()).toEqual([])
  })

  it('原生移除失败时不动 store，避免 UI 与播放器队列错位', async () => {
    loadQueue(1)
    rntp.remove.mockRejectedValueOnce(new Error('队列已被其他操作改过'))

    await clearUpcoming()

    expect(queueIds()).toEqual(ids)
  })
})

// ── 单曲移除 ────────────────────────────────────────────────────────────────

describe('removeFromQueue 不允许删掉正在播放的那首', () => {
  it('目标是当前曲目时直接返回，不碰原生播放器', async () => {
    loadQueue(1)

    await removeFromQueue(1)

    expect(rntp.remove).not.toHaveBeenCalled()
    expect(queueIds()).toEqual(ids)
  })

  it('删除待播曲目会同步原生队列与 store', async () => {
    loadQueue(0)

    await removeFromQueue(2)

    expect(rntp.remove).toHaveBeenCalledWith([2])
    expect(queueIds()).toEqual(['a', 'b', 'd'])
  })

  it('删除当前之前的曲目会把 index 前移，仍指向同一首', async () => {
    loadQueue(2)

    await removeFromQueue(0)

    expect(queueIds()).toEqual(['b', 'c', 'd'])
    expect(usePlayerStore.getState().queue[usePlayerStore.getState().index]!.trackId).toBe('c')
  })

  it('原生删除失败时不动 store', async () => {
    loadQueue(0)
    rntp.remove.mockRejectedValueOnce(new Error('boom'))

    await removeFromQueue(2)

    expect(queueIds()).toEqual(ids)
  })
})

// ── 拖动排序 ────────────────────────────────────────────────────────────────

describe('moveInQueue 先改原生再同步展示顺序', () => {
  it('起止下标相同时直接返回', async () => {
    loadQueue(0)

    await moveInQueue(1, 1)

    expect(rntp.move).not.toHaveBeenCalled()
  })

  it('原生移动成功后才更新 store，且 index 跟着当前曲目走', async () => {
    loadQueue(0)

    await moveInQueue(2, 1)

    expect(rntp.move).toHaveBeenCalledWith(2, 1)
    expect(queueIds()).toEqual(['a', 'c', 'b', 'd'])
    expect(usePlayerStore.getState().index).toBe(0)
  })

  it('原生移动失败时不改 store，否则两端顺序永久错位', async () => {
    loadQueue(0)
    rntp.move.mockRejectedValueOnce(new Error('boom'))

    await moveInQueue(2, 1)

    expect(queueIds()).toEqual(ids)
  })
})

// ── 循环模式 ────────────────────────────────────────────────────────────────

describe('cycleRepeat 三档循环', () => {
  it('off → queue → one → off', async () => {
    expect(await cycleRepeat()).toBe('queue')
    expect(await cycleRepeat()).toBe('one')
    expect(await cycleRepeat()).toBe('off')
  })

  it('循环模式同时下发给原生播放器', async () => {
    await cycleRepeat()

    // queue 对应 RNTP 的 Queue
    expect(rntp.setRepeatMode).toHaveBeenCalledWith(2)
  })

  it('原生下发失败时保持原模式，不写 store', async () => {
    // 这条是刻意保留的降级路径，会打 warn：断言它确实打了，同时别脏测试输出
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    rntp.setRepeatMode.mockRejectedValueOnce(new Error('播放器没就绪'))

    expect(await cycleRepeat()).toBe('off')
    expect(usePlayerStore.getState().playMode.repeat).toBe('off')
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})

// ── 清空整个队列 ────────────────────────────────────────────────────────────

describe('clearQueue 是「全新状态」语义', () => {
  it('清空队列、复位原生播放器并清掉播放快照', async () => {
    loadQueue(0)
    const persist = await import('../../src/player/persist')

    await clearQueue()

    expect(rntp.reset).toHaveBeenCalled()
    expect(queueIds()).toEqual([])
    expect(persist.clearPlaybackSnapshot).toHaveBeenCalled()
  })

  it('顺带清掉强制转码标记，否则重新登录后会继承上一轮的标记', async () => {
    const track = item('a', 'flac')
    markForcedTranscode(track.qid)
    expect(shouldTranscode(track)).toBe(true)

    await clearQueue()

    expect(shouldTranscode(track)).toBe(false)
  })
})

// ── 领域曲目 → 队列元素 ─────────────────────────────────────────────────────

describe('toQueueItem 映射领域曲目', () => {
  const provider = {
    image: (coverId: string, size?: number) => ({ url: `img://${coverId}`, size }),
  } as unknown as MusicProvider

  const track: Track = {
    id: 't1',
    title: '标题',
    durationMs: 123_000,
    artists: [
      { id: 'ar1', name: '甲' },
      { id: 'ar2', name: '乙' },
    ],
    genres: [{ id: 'g1', name: '流行' }],
    isCue: false,
    isFavorite: true,
    album: { id: 'al1', name: '专辑名', coverId: 'cover-1' },
    audio: {
      format: 'flac',
      sizeBytes: 1024,
      bitrateBps: 1411200,
      sampleRateHz: 44100,
      bitDepth: 16,
      channels: 2,
    },
  }

  it('把多艺术家拼成展示文案，并带上专辑与封面', () => {
    const result = toQueueItem(track, provider, 'srv')

    expect(result).toMatchObject({
      serverId: 'srv',
      trackId: 't1',
      title: '标题',
      artistText: '甲 / 乙',
      albumText: '专辑名',
      albumId: 'al1',
      artistId: 'ar1',
      coverId: 'cover-1',
      format: 'flac',
      isFavorite: true,
      durationMs: 123_000,
      sizeBytes: 1024,
      bitDepth: 16,
    })
    expect(result.qid).toMatch(/^srv:t1:/)
  })

  it('把完整曲目留在队列元素上（队列页历史行要用它做「加入队列 / 下一首播放」）', () => {
    // 队列元素本身只存展示字段；没有这份 Track，历史行的菜单就只能少两条操作
    expect(toQueueItem(track, provider, 'srv').track).toBe(track)
  })

  it('没有艺术家时给出兜底文案而不是空字符串', () => {
    expect(toQueueItem({ ...track, artists: [] }, provider, 'srv').artistText).toBe('未知艺术家')
  })

  it('format 缺失时从文件路径后缀推断', () => {
    const result = toQueueItem(
      { ...track, audio: { path: '/music/a/b/dsd/曲目.DSF' } },
      provider,
      'srv',
    )

    expect(result.format).toBe('DSF')
    // 推断出的格式要能喂给转码判定：DSD 原生解不了
    expect(shouldTranscode(result)).toBe(true)
  })

  it('封面缺失时不产生空的 artwork 字段', () => {
    const result = toQueueItem(
      { ...track, coverId: undefined, album: { id: 'al1', name: '专辑名' } },
      provider,
      'srv',
    )

    expect(result.coverId).toBeUndefined()
    expect(result.artwork).toBeUndefined()
  })

  it('每次入队都生成新的 occurrence，同一首歌在队列里可重复出现', () => {
    const first = toQueueItem(track, provider, 'srv')
    const second = toQueueItem(track, provider, 'srv')

    expect(first.qid).not.toBe(second.qid)
    expect(first.trackId).toBe(second.trackId)
  })
})

// ── 切歌：下一首 ────────────────────────────────────────────────────────────

describe('skipToNextSafe 切下一首', () => {
  it('队列只有一首时什么都不做', async () => {
    loadQueueOf(['a'], 0)

    await skipToNextSafe()

    expect(rntp.skipToNext).not.toHaveBeenCalled()
    expect(rntp.play).not.toHaveBeenCalled()
  })

  it('按目标 qid 定位原生下标，切歌后显式 play 兜住暂停态', async () => {
    loadQueue(0)
    const target = usePlayerStore.getState().queue[1]!
    await skipToNextSafe()
    expect(rntp.skip).toHaveBeenCalledWith(1)
    expect(rntp.play).toHaveBeenCalled()
    expect(usePlayerStore.getState().queue[0]?.qid).toBe(target.qid)
  })

  it('原生队列已移位时仍然跳到点击时选中的曲目', async () => {
    loadQueue(0)
    const target = usePlayerStore.getState().queue[1]!
    rntp.getQueue.mockResolvedValue([{ id: target.qid }])
    await skipToNextSafe()
    expect(rntp.skip).toHaveBeenCalledWith(0)
    expect(usePlayerStore.getState().queue[0]?.qid).toBe(target.qid)
  })

  it('原生切换失败会反馈错误，不补 play，也不改已提交队列', async () => {
    loadQueue(0)
    const before = usePlayerStore.getState().queue
    rntp.skip.mockRejectedValueOnce(new Error('boom'))
    await expect(skipToNextSafe()).rejects.toThrow('boom')
    expect(rntp.play).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().queue).toBe(before)
    expect(usePlayerStore.getState().pendingCurrent).toBeUndefined()
  })

  it('无需等待原生激活事件就更新当前项，并保留离开项的历史', async () => {
    loadQueue(0)
    const before = usePlayerStore.getState().queue
    await skipToNextSafe()
    expect(usePlayerStore.getState().index).toBe(0)
    expect(usePlayerStore.getState().queue[0]?.qid).toBe(before[1]?.qid)
    expect(usePlayerStore.getState().history.at(-1)?.trackId).toBe(before[0]?.trackId)
  })

  it('首个列表仍在加载时点击下一首，直接加载下一目标', async () => {
    // 旧来源还有多首待播时也必须等待新列表，不能误切旧队列。
    loadQueue(0)
    const streamGate = deferred<{ url: string }>()
    const slowProvider = {
      ...provider,
      stream: vi.fn(async (trackId: string) => {
        if (trackId === 'a') return streamGate.promise
        return { url: `stream://${trackId}` }
      }),
    } as unknown as MusicProvider

    const start = playTrackList({
      provider: slowProvider,
      serverId: 'srv',
      tracks: [makeTrack('a'), makeTrack('b')],
      startIndex: 0,
      source: { kind: 'tracks', label: '全部歌曲' },
    })
    await Promise.resolve()
    expect(usePlayerStore.getState().isLoadingAudio).toBe(true)

    await skipToNextSafe()
    expect(rntp.skip).not.toHaveBeenCalled()

    streamGate.resolve({ url: 'stream://a' })
    await start

    expect(queueIds()[0]).toBe('b')
    expect(rntp.play).toHaveBeenCalled()
  })

})

// ── 切歌：待播列表点某一行 ──────────────────────────────────────────────────

describe('skipToIndex 待播列表点播', () => {
  it('下标 <= 0 直接返回（第 0 项就是当前这首）', async () => {
    loadQueue(0)

    await skipToIndex(0)
    await skipToIndex(-1)

    expect(rntp.skip).not.toHaveBeenCalled()
  })

  it('合法下标：切过去并继续播', async () => {
    loadQueue(0)

    await skipToIndex(3)

    expect(rntp.skip).toHaveBeenCalledWith(3)
    expect(rntp.play).toHaveBeenCalled()
  })

  it('下标越界（队列刚被改过）时静默忽略，且不再补 play', async () => {
    loadQueue(0)
    rntp.skip.mockRejectedValueOnce(new Error('index out of range'))

    await expect(skipToIndex(9)).resolves.toBeUndefined()

    // play 在 try 里、skip 之后：切歌没成功就不该继续播
    expect(rntp.play).not.toHaveBeenCalled()
  })
})

// ── 切歌：上一首 ────────────────────────────────────────────────────────────

describe('skipToPreviousSmart 上一首', () => {
  it('播放已结束：回到本曲开头重播，不去翻历史', async () => {
    loadQueue(0)
    usePlayerStore.getState().setPlaybackEnded(true)

    await skipToPreviousSmart()

    expect(rntp.seekTo).toHaveBeenCalledWith(0)
    expect(rntp.play).toHaveBeenCalled()
    expect(rntp.add).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().playbackEnded).toBe(false)
  })

  it('没有历史曲目：回到本曲开头', async () => {
    loadQueue(1)

    await skipToPreviousSmart()

    expect(rntp.seekTo).toHaveBeenCalledWith(0)
    expect(rntp.add).not.toHaveBeenCalled()
  })

  it('有历史但 provider 已丢失：仍然回本曲开头，不炸', async () => {
    loadQueue(1)
    usePlayerStore.getState().appendHistoryItem(item('z'))

    await skipToPreviousSmart()

    expect(rntp.seekTo).toHaveBeenCalledWith(0)
    expect(rntp.add).not.toHaveBeenCalled()
  })

  it('有历史 + provider：不等缓冲事件就把上一首提交到队首', async () => {
    loadQueue(1)
    usePlayerStore.getState().appendHistoryItem(item('z'))
    rememberProvider(fakeProvider())
    const nativeQueue = usePlayerStore.getState().queue.map((entry) => ({ id: entry.qid }))
    rntp.getQueue.mockImplementation(async () => [...nativeQueue])
    rntp.add.mockImplementation(async (tracks, position = nativeQueue.length) => {
      nativeQueue.splice(position, 0, ...(Array.isArray(tracks) ? tracks : [tracks]))
    })

    await skipToPreviousSmart()

    expect(rntp.add).toHaveBeenCalled()
    const track = addedSingleTrack()
    expect(addPosition()).toBe(0)
    expect(rntp.skip).toHaveBeenCalledWith(0)
    expect(rntp.play).toHaveBeenCalled()
    expect(usePlayerStore.getState().queue[0]).toMatchObject({ qid: track.id, trackId: 'z' })
    expect(usePlayerStore.getState().history).toHaveLength(0)
    // 控制器已提交；迟到事件不能重复恢复同一历史项。
    expect(takePendingPreviousActivation(track.id)).toBeUndefined()
  })

  it('原生插入失败时撤销待激活项并反馈失败，保留历史和队列', async () => {
    loadQueue(1)
    usePlayerStore.getState().appendHistoryItem(item('z'))
    rememberProvider(fakeProvider())
    rntp.add.mockRejectedValueOnce(new Error('播放器没就绪'))

    const before = usePlayerStore.getState().queue
    await expect(skipToPreviousSmart()).rejects.toThrow('播放器没就绪')

    expect(rntp.seekTo).not.toHaveBeenCalled()
    expect(rntp.play).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().queue).toBe(before)
    expect(usePlayerStore.getState().history).toHaveLength(1)
    // 不能留下悬挂的待激活项，否则下一次同 id 的切歌会被错误认领
    const attemptedId = addedSingleTrack().id
    expect(takePendingPreviousActivation(attemptedId)).toBeUndefined()
  })
})

// ── 随机播放 ────────────────────────────────────────────────────────────────

describe('setShuffledOrder 只重排当前之后的曲目', () => {
  it('开关没变时直接返回，不做任何重排', async () => {
    loadQueue(0)

    await setShuffledOrder(false)

    expect(rntp.move).not.toHaveBeenCalled()
  })

  it('待播不足两首时只翻开关，不重排', async () => {
    loadQueue(2) // 4 首、当前在第 3 首 → 队尾只剩 1 首

    await setShuffledOrder(true)

    expect(usePlayerStore.getState().playMode.shuffle).toBe(true)
    expect(rntp.move).not.toHaveBeenCalled()
    expect(queueIds()).toEqual(ids)
  })

  it('还没开始播（index < 0）时只翻开关', async () => {
    loadQueue(-1)

    await setShuffledOrder(true)

    expect(usePlayerStore.getState().playMode.shuffle).toBe(true)
    expect(rntp.move).not.toHaveBeenCalled()
  })

  it('打开随机：当前曲目与已播部分保持原位，只打乱队尾', async () => {
    loadQueue(0)
    // 固定随机数让这次重排可复现；断言本身不依赖具体洗牌结果
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)

    await setShuffledOrder(true)

    const after = queueIds()
    // 当前这首不能被挪走 —— 否则「切随机」等于打断正在播的歌
    expect(after[0]).toBe('a')
    expect(usePlayerStore.getState().index).toBe(0)
    expect(usePlayerStore.getState().playMode.shuffle).toBe(true)
    // 队尾只是换了顺序，不能多也不能少
    expect(new Set(after.slice(1))).toEqual(new Set(['b', 'c', 'd']))
    expect(rntp.move).toHaveBeenCalled()
    // 展示顺序必须与下发给原生播放器的 move 结果一致（两端错位是这个模块的老毛病）
    expect(after.slice(1)).toEqual(applyMoves(['b', 'c', 'd'], 1, rntp.move.mock.calls))

    random.mockRestore()
  })

  it('关闭随机：按原始顺序快照还原队尾', async () => {
    loadQueue(0)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    await setShuffledOrder(true)
    // 先确认确实被打乱了，否则下面的断言是空的
    expect(queueIds()).not.toEqual(ids)

    await setShuffledOrder(false)

    expect(queueIds()).toEqual(ids)
    expect(usePlayerStore.getState().playMode.shuffle).toBe(false)

    random.mockRestore()
  })

  it('重排失败时开关保持已翻转，不把按钮卡在旧状态', async () => {
    loadQueue(0)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // ⚠️ 必须固定随机数。`shuffled()` 是 Fisher–Yates，3 个元素时有 1/6 的概率
    // 洗出**和原顺序一样**的结果；那样 planTailReorder 会返回空移动列表，
    // rntp.move 一次都不会被调用 → 下面这个 mockRejectedValueOnce 永远不会触发
    // → 走不到 warn 分支。于是测试变成 ~17% 概率偶发失败的「薛定谔用例」。
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    rntp.move.mockRejectedValueOnce(new Error('播放器没就绪'))

    await setShuffledOrder(true)

    expect(usePlayerStore.getState().playMode.shuffle).toBe(true)
    expect(queueIds()).toEqual(ids)
    expect(warn).toHaveBeenCalled()

    random.mockRestore()
    warn.mockRestore()
  })
})

describe('toggleShuffle 兼容旧调用', () => {
  it('返回翻转后的新状态', async () => {
    loadQueue(0)

    await expect(toggleShuffle()).resolves.toBe(true)
    await expect(toggleShuffle()).resolves.toBe(false)
  })
})

// ── provider 生命周期 ───────────────────────────────────────────────────────

describe('rememberProvider 登出时清理模块级状态', () => {
  it('传 null 清掉强制转码标记，避免换账号后继承上一轮的标记', () => {
    const track = item('a', 'flac')
    markForcedTranscode(track.qid)
    expect(shouldTranscode(track)).toBe(true)

    rememberProvider(null)

    expect(shouldTranscode(track)).toBe(false)
  })

  it('传 null 同时停掉后台的转码缓存与预热任务', async () => {
    const transcodeCache = await import('../../src/player/transcode-cache')
    const prewarm = await import('../../src/player/transcode-prewarm')

    rememberProvider(null)

    expect(transcodeCache.abortTranscodeCaching).toHaveBeenCalled()
    expect(prewarm.clearWarmTranscode).toHaveBeenCalled()
  })
})

// ── 队列构建三兄弟（playTrackList / appendTracks / playNext）──────────────────

/**
 * 这一组盯的是「起播时队列怎么建」。三处都只用播放器的调用实参 + store 的最终
 * 状态做断言，不碰原生。
 *
 * ⚠️ 夹具刻意**不带封面**：`playTrackList` 起播成功后会 `void refreshArtwork(...)`，
 * 而 `refreshArtwork` 只在 `item.artwork` 存在时才去下封面。一旦带上封面，这条
 * 游离的 promise 就会真的走到 `cacheArtwork`（未替身，要碰文件系统），
 * 把用例变成不可控的异步噪声。封面地址的计算由下面 `toQueueItem` 那组单独覆盖。
 */
const provider = fakeProvider()

function playListInput(
  tracks: Track[],
  startIndex = 0,
  source: PlaySource = { kind: 'tracks', label: '全部歌曲' },
) {
  return { provider, serverId: 'srv', tracks, startIndex, source }
}

describe('playTrackList 起播时重建队列', () => {
  it('空列表直接返回：不碰播放器，也不把旧队列清掉', async () => {
    loadQueue(0)
    const before = queueIds()

    await playTrackList(playListInput([]))

    expect(rntp.reset).not.toHaveBeenCalled()
    expect(rntp.add).not.toHaveBeenCalled()
    expect(rntp.play).not.toHaveBeenCalled()
    expect(queueIds()).toEqual(before)
  })

  it('点第 N 首 = 这首及之后进队列，前段丢弃（对齐 Apple Music）', async () => {
    await playTrackList(
      playListInput([makeTrack('a'), makeTrack('b'), makeTrack('c'), makeTrack('d')], 2),
    )

    // 点了第 3 首（c）→ 队列只剩 c, d；前面的 a, b 不进待播
    expect(queueIds()).toEqual(['c', 'd'])
    expect(usePlayerStore.getState().index).toBe(0)
  })

  it('越界的 startIndex 夹到有效范围，不会拿 undefined 去起播', async () => {
    await playTrackList(playListInput([makeTrack('a'), makeTrack('b')], 99))
    // 夹到末项 → 只剩最后一首
    expect(queueIds()).toEqual(['b'])

    await playTrackList(playListInput([makeTrack('a'), makeTrack('b')], -5))
    // 夹到 0 → 整个列表
    expect(queueIds()).toEqual(['a', 'b'])
  })

  it('先 reset 再 add —— 顺序反了会把上一个来源的队列留在播放器里', async () => {
    await playTrackList(playListInput([makeTrack('a'), makeTrack('b')]))

    const resetAt = rntp.reset.mock.invocationCallOrder[0]!
    const addAt = rntp.add.mock.invocationCallOrder[0]!
    expect(resetAt).toBeLessThan(addAt)
  })

  it('下发给播放器的顺序与 store 的展示顺序逐项一致', async () => {
    await playTrackList(playListInput([makeTrack('a'), makeTrack('b'), makeTrack('c')], 1))

    // 原生曲目的 id 就是 qid，用它把两端对齐；错位不会报错，只会静默放错歌
    const added = addedTracks()
    expect(added.map((track) => track.id)).toEqual(
      usePlayerStore.getState().queue.map((entry) => entry.qid),
    )
    // 点第 2 首（b）→ 只剩 b, c 两首
    expect(added).toHaveLength(2)
  })

  it('把选中那首的播放地址交给播放器（起播不能拿到别的歌）', async () => {
    await playTrackList(playListInput([makeTrack('a'), makeTrack('b')], 1))

    expect(addedTracks()[0]!.url).toBe('stream://b')
  })

  it('起播会真的调用 play，并把来源记进队列', async () => {
    const source: PlaySource = { kind: 'album', id: 'al-1', label: '专辑 · 范特西' }

    await playTrackList(playListInput([makeTrack('a')], 0, source))

    expect(rntp.play).toHaveBeenCalled()
    expect(usePlayerStore.getState().source).toEqual(source)
  })

  it('尊重当前随机开关：开着随机时点列表，当前这首不动、其后打乱', async () => {
    usePlayerStore.getState().setShuffle(true)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)

    // 点第 1 首，slice 后自然顺序 = [a,b,c,d]
    await playTrackList(
      playListInput([makeTrack('a'), makeTrack('b'), makeTrack('c'), makeTrack('d')], 0),
    )

    const q = queueIds()
    // 随机不被重置（不再强制关）
    expect(usePlayerStore.getState().playMode.shuffle).toBe(true)
    // 当前这首（a）固定在队首，其后被打乱（集合不变）
    expect(q[0]).toBe('a')
    expect(new Set(q.slice(1))).toEqual(new Set(['b', 'c', 'd']))
    // baseQueue 恒存原始顺序（供取消随机时还原）
    expect(usePlayerStore.getState().baseQueue.map((e) => e.trackId)).toEqual(['a', 'b', 'c', 'd'])

    random.mockRestore()
  })

  it('随机关时点列表：按原始顺序进待播', async () => {
    usePlayerStore.getState().setShuffle(false)

    await playTrackList(
      playListInput([makeTrack('a'), makeTrack('b'), makeTrack('c')], 0),
    )

    expect(queueIds()).toEqual(['a', 'b', 'c'])
    expect(usePlayerStore.getState().playMode.shuffle).toBe(false)
  })
})

describe('playSingleTrack 搜索点歌走单曲', () => {
  it('队列只有这一首，待播为空', async () => {
    // 先装个多首队列，确认单曲会把它整个换掉
    loadQueue(0)
    await playSingleTrack({
      provider,
      serverId: 'srv',
      track: makeTrack('z'),
      source: { kind: 'search', label: '搜索 · z' },
    })

    expect(queueIds()).toEqual(['z'])
    expect(usePlayerStore.getState().index).toBe(0)
    // 待播为空（只有当前这首）
    expect(usePlayerStore.getState().queue.length).toBe(1)
  })

  it('单曲不登记列表续拉器（搜索结果不当队列）', async () => {
    await playSingleTrack({
      provider,
      serverId: 'srv',
      track: makeTrack('z'),
      source: { kind: 'search', label: '搜索 · z' },
    })
    expect(hasPendingListFeed()).toBe(false)
  })
})

describe('列表续拉器（分页静默补下页）', () => {
  it('playTrackList 传 loadMorePage 时登记续拉器', async () => {
    await playTrackList({
      ...playListInput([makeTrack('a'), makeTrack('b')], 0),
      loadedPage: 1,
      loadMorePage: async () => [makeTrack('c')],
    })
    expect(hasPendingListFeed()).toBe(true)
  })

  it('fillFromListFeed 把下一页追加到队尾', async () => {
    await playTrackList({
      ...playListInput([makeTrack('a'), makeTrack('b')], 0),
      loadedPage: 1,
      loadMorePage: async (page) => (page === 2 ? [makeTrack('c'), makeTrack('d')] : []),
    })

    await fillFromListFeed(provider, 'srv')

    expect(queueIds()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('返回空页→标记列表已到末尾，不再补', async () => {
    await playTrackList({
      ...playListInput([makeTrack('a')], 0),
      loadedPage: 1,
      loadMorePage: async () => [],
    })

    await fillFromListFeed(provider, 'srv')
    expect(hasPendingListFeed()).toBe(false)
    expect(queueIds()).toEqual(['a'])
  })

  it('不传 loadMorePage 时无续拉器（专辑这类一次拉全的列表）', async () => {
    await playTrackList(playListInput([makeTrack('a'), makeTrack('b')], 0))
    expect(hasPendingListFeed()).toBe(false)
  })
})

describe('appendTracks 追加到队尾', () => {
  it('空列表不碰播放器也不动队列', async () => {
    loadQueue(0)

    await appendTracks({ provider, serverId: 'srv', tracks: [] })

    expect(rntp.add).not.toHaveBeenCalled()
    expect(queueIds()).toEqual(ids)
  })

  it('同时追加进 queue 与 baseQueue —— 只追加一边，关掉随机后就会丢歌', async () => {
    loadQueue(0)

    await appendTracks({ provider, serverId: 'srv', tracks: [makeTrack('x'), makeTrack('y')] })

    const state = usePlayerStore.getState()
    expect(state.queue.map((entry) => entry.trackId)).toEqual([...ids, 'x', 'y'])
    expect(state.baseQueue.map((entry) => entry.trackId)).toEqual([...ids, 'x', 'y'])
  })

  it('不带插入位置，让播放器自己排到队尾', async () => {
    loadQueue(0)

    await appendTracks({ provider, serverId: 'srv', tracks: [makeTrack('x')] })

    expect(addPosition()).toBeUndefined()
  })
})

describe('playNext 插到当前曲目之后', () => {
  it('空列表不碰播放器也不动队列', async () => {
    loadQueue(0)

    await playNext({ provider, serverId: 'srv', tracks: [] })

    expect(rntp.add).not.toHaveBeenCalled()
    expect(queueIds()).toEqual(ids)
  })

  it('原生侧插在 index + 1，store 侧也插在当前之后 —— 两端必须同址', async () => {
    loadQueue(2)

    await playNext({ provider, serverId: 'srv', tracks: [makeTrack('x')] })

    // 原生：add(tracks, index + 1)
    expect(addPosition()).toBe(3)
    // store：当前仍是 c（下标 2），x 落在它后面
    expect(queueIds()).toEqual(['a', 'b', 'c', 'x', 'd'])
    expect(usePlayerStore.getState().index).toBe(2)
  })

  it('连插两首时顺序稳定，后插的排在先插的后面', async () => {
    loadQueue(0)

    await playNext({ provider, serverId: 'srv', tracks: [makeTrack('x')] })
    await playNext({ provider, serverId: 'srv', tracks: [makeTrack('y')] })

    // 第二首仍插在「当前曲目之后」，所以落在 x 前面 —— 这是既有语义，钉住它
    expect(queueIds()).toEqual(['a', 'y', 'x', 'b', 'c', 'd'])
  })
})

/**
 * 这一组是**变异测试逼出来的**：把 `cycleCurrentToQueueEnd` 里的单曲改成数组推给
 * 原生，整批用例居然全绿 —— 说明它当时一条覆盖都没有（唯一调用方是没测试的
 * `bridge.tsx`）。补上之后该破坏会被 `addedSingleTrack()` 直接炸出来。
 */
describe('cycleCurrentToQueueEnd 把播完的当前曲目挪到队尾', () => {
  it('没有 provider 时直接返回，不碰播放器', async () => {
    loadQueue(0)

    await cycleCurrentToQueueEnd(item('a'))

    expect(rntp.add).not.toHaveBeenCalled()
    expect(rntp.remove).not.toHaveBeenCalled()
  })

  it('先追加到队尾再删掉队首 —— 顺序反了会先把歌删没', async () => {
    rememberProvider(provider)

    await cycleCurrentToQueueEnd(item('a'))

    expect(addedSingleTrack().id).toBeDefined()
    expect(rntp.remove).toHaveBeenCalledWith([0])
    const addAt = rntp.add.mock.invocationCallOrder[0]!
    const removeAt = rntp.remove.mock.invocationCallOrder[0]!
    expect(addAt).toBeLessThan(removeAt)
  })

  it('追加失败时仍然清掉队首，不把队列卡在半截', async () => {
    rememberProvider(provider)
    rntp.add.mockRejectedValueOnce(new Error('播放器没就绪'))

    await cycleCurrentToQueueEnd(item('a'))

    expect(rntp.remove).toHaveBeenCalledWith([0])
  })
})

describe('toQueueItem 把领域曲目转成队列元素', () => {
  it('有封面时把鉴权地址一并算好，锁屏 / 车机不用再请求', () => {
    const entry = toQueueItem({ ...makeTrack('a'), coverId: 'cv-1' }, provider, 'srv')

    expect(entry.coverId).toBe('cv-1')
    expect(entry.artwork).toEqual({ url: 'img://cv-1', size: 600 })
  })

  it('没有封面时不带 artwork，免得去下载一个空地址', () => {
    expect(toQueueItem(makeTrack('a'), provider, 'srv').artwork).toBeUndefined()
  })

  it('多位艺术家用 / 连接，没有艺术家时兜底成「未知艺术家」', () => {
    const duet = toQueueItem(
      { ...makeTrack('a'), artists: [{ id: '1', name: '甲' }, { id: '2', name: '乙' }] },
      provider,
      'srv',
    )
    expect(duet.artistText).toBe('甲 / 乙')

    expect(toQueueItem({ ...makeTrack('b'), artists: [] }, provider, 'srv').artistText).toBe(
      '未知艺术家',
    )
    expect(toQueueItem({ ...makeTrack('c'), artists: [{ id: 'ar-blank', name: '   ' }] }, provider, 'srv').artistText).toBe(
      '未知艺术家',
    )
  })

  it('列表缺少艺人名称时用艺人详情异步补齐，并同步系统播放器', async () => {
    const artist = vi.fn(async (id: string) => ({ id, name: '许嵩' }))
    rememberProvider({ ...fakeProvider(), artist } as MusicProvider)
    const entry = toQueueItem({ ...makeTrack('a'), artists: [{ id: 'ar-1', name: ' ' }] }, fakeProvider(), 'srv')
    usePlayerStore.getState().setQueue([entry], 0)

    await refreshArtist(0)

    expect(artist).toHaveBeenCalledWith('ar-1')
    expect(usePlayerStore.getState().queue[0]?.artistText).toBe('许嵩')
    expect(usePlayerStore.getState().queue[0]?.track?.artists[0]?.name).toBe('许嵩')
    expect(rntp.updateMetadataForTrack).toHaveBeenCalledWith(0, expect.objectContaining({ artist: '许嵩' }))
  })

  it('艺人详情迟到时不把旧歌曲名称写到新歌曲上', async () => {
    const pending = deferred<{ id: string; name: string }>()
    rememberProvider({ ...fakeProvider(), artist: () => pending.promise } as MusicProvider)
    const entry = toQueueItem({ ...makeTrack('a'), artists: [{ id: 'ar-1', name: '' }] }, fakeProvider(), 'srv')
    usePlayerStore.getState().setQueue([entry], 0)
    const refresh = refreshArtist(0)
    usePlayerStore.getState().setQueue([item('b')], 0)

    pending.resolve({ id: 'ar-1', name: '旧艺人' })
    await refresh

    expect(usePlayerStore.getState().queue[0]?.artistText).toBe('测试艺术家')
    expect(rntp.updateMetadataForTrack).not.toHaveBeenCalled()
  })

  it('同一首歌的重复切歌事件只请求一次艺人详情', async () => {
    const pending = deferred<{ id: string; name: string }>()
    const artist = vi.fn(() => pending.promise)
    rememberProvider({ ...fakeProvider(), artist } as MusicProvider)
    const entry = toQueueItem({ ...makeTrack('a'), artists: [{ id: 'ar-1', name: '' }] }, fakeProvider(), 'srv')
    usePlayerStore.getState().setQueue([entry], 0)

    const first = refreshArtist(0)
    const second = refreshArtist(0)
    expect(artist).toHaveBeenCalledTimes(1)
    pending.resolve({ id: 'ar-1', name: '许嵩' })
    await Promise.all([first, second])
    expect(usePlayerStore.getState().queue[0]?.artistText).toBe('许嵩')
  })

  it('同一首歌两次入队拿到不同 qid，队列里能区分两次出现', () => {
    const first = toQueueItem(makeTrack('a'), provider, 'srv')
    const second = toQueueItem(makeTrack('a'), provider, 'srv')

    expect(first.qid).not.toBe(second.qid)
    expect(first.trackId).toBe(second.trackId)
  })
})
