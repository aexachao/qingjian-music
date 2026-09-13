import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueItem, Track } from '@qj/core-domain'
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

const rntp = vi.hoisted(() => ({
  move: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  reset: vi.fn(async () => undefined),
  setRepeatMode: vi.fn(async () => undefined),
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
  clearForcedTranscode,
  clearQueue,
  clearUpcoming,
  cycleRepeat,
  markForcedTranscode,
  moveInQueue,
  removeFromQueue,
  shouldTranscode,
  toQueueItem,
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

beforeEach(() => {
  usePlayerStore.getState().clear()
  usePlayerStore.getState().setRepeat('off')
  vi.clearAllMocks()
  // ensurePlayer 的默认实现被 clearAllMocks 清掉了，补回来
  setup.ensurePlayer.mockResolvedValue(undefined)
  for (const fn of [rntp.move, rntp.remove, rntp.reset, rntp.setRepeatMode]) {
    fn.mockResolvedValue(undefined)
  }
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
