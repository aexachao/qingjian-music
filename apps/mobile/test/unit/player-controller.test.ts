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
  markForcedTranscode,
  moveInQueue,
  playNext,
  playTrackList,
  rememberProvider,
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
  ]) {
    fn.mockResolvedValue(undefined)
  }
  rntp.getActiveTrackIndex.mockResolvedValue(0)
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

  it('正常切歌：交给原生 skipToNext，再显式 play 兜住暂停态', async () => {
    loadQueue(0)

    await skipToNextSafe()

    expect(rntp.skipToNext).toHaveBeenCalled()
    expect(rntp.skip).not.toHaveBeenCalled()
    expect(rntp.play).toHaveBeenCalled()
  })

  it('skipToNext 失败（队尾）时回退到 skip(1)', async () => {
    loadQueue(0)
    rntp.skipToNext.mockRejectedValueOnce(new Error('已经在队尾'))

    await skipToNextSafe()

    expect(rntp.skip).toHaveBeenCalledWith(1)
    expect(rntp.play).toHaveBeenCalled()
  })

  it('回退也失败时不抛错，避免按钮点了没反应还崩', async () => {
    loadQueue(0)
    rntp.skipToNext.mockRejectedValueOnce(new Error('boom'))
    rntp.skip.mockRejectedValueOnce(new Error('boom'))

    await expect(skipToNextSafe()).resolves.toBeUndefined()
  })

  it('切歌后按播放器的实际下标回写 store', async () => {
    loadQueue(0)
    rntp.getActiveTrackIndex.mockResolvedValueOnce(2)

    await skipToNextSafe()

    expect(usePlayerStore.getState().index).toBe(2)
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

  it('有历史 + provider：把上一首插到队首并切过去，同时登记待激活项', async () => {
    loadQueue(1)
    usePlayerStore.getState().appendHistoryItem(item('z'))
    rememberProvider(fakeProvider())

    await skipToPreviousSmart()

    expect(rntp.add).toHaveBeenCalled()
    const track = addedSingleTrack()
    expect(addPosition()).toBe(0)
    expect(rntp.skip).toHaveBeenCalledWith(0)
    expect(rntp.play).toHaveBeenCalled()
    // 待激活项必须与推给原生播放器的 id 对齐 —— bridge 就是靠这个 id 认领激活的
    expect(takePendingPreviousActivation(track.id)).toMatchObject({ trackId: 'z' })
    // 一次性的：认领过就没了，避免同一次切歌被处理两遍
    expect(takePendingPreviousActivation(track.id)).toBeUndefined()
  })

  it('原生插入失败时撤销待激活项并回本曲开头', async () => {
    loadQueue(1)
    usePlayerStore.getState().appendHistoryItem(item('z'))
    rememberProvider(fakeProvider())
    rntp.add.mockRejectedValueOnce(new Error('播放器没就绪'))

    await skipToPreviousSmart()

    expect(rntp.seekTo).toHaveBeenCalledWith(0)
    expect(rntp.play).toHaveBeenCalled()
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

  it('把选中的那首转到队首，其余保持原相对顺序', async () => {
    await playTrackList(
      playListInput([makeTrack('a'), makeTrack('b'), makeTrack('c'), makeTrack('d')], 2),
    )

    expect(queueIds()).toEqual(['c', 'a', 'b', 'd'])
    expect(usePlayerStore.getState().index).toBe(0)
  })

  it('越界的 startIndex 夹到有效范围，不会拿 undefined 去起播', async () => {
    await playTrackList(playListInput([makeTrack('a'), makeTrack('b')], 99))
    expect(queueIds()).toEqual(['b', 'a'])

    await playTrackList(playListInput([makeTrack('a'), makeTrack('b')], -5))
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
    expect(added).toHaveLength(3)
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

  it('新队列把随机播放关掉，避免「开关是开着的、顺序却是原始的」', async () => {
    loadQueue(0)
    usePlayerStore.getState().setShuffle(true)

    await playTrackList(playListInput([makeTrack('a'), makeTrack('b')]))

    expect(usePlayerStore.getState().playMode.shuffle).toBe(false)
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
  })

  it('同一首歌两次入队拿到不同 qid，队列里能区分两次出现', () => {
    const first = toQueueItem(makeTrack('a'), provider, 'srv')
    const second = toQueueItem(makeTrack('a'), provider, 'srv')

    expect(first.qid).not.toBe(second.qid)
    expect(first.trackId).toBe(second.trackId)
  })
})
