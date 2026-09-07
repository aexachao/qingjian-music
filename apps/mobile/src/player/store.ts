import { create } from 'zustand'
import type { PlayMode, PlaySource, QueueItem, RepeatMode } from '@qj/core-domain'
import { DEFAULT_PLAY_MODE } from '@qj/core-domain'

interface PlayerState {
  /** 与 RNTP 队列一一对应的展示数据（锁屏、迷你条、正在播放页、队列页都读它） */
  queue: QueueItem[]
  /**
   * 队列的原始顺序快照。开随机播放时只重排「当前曲目之后」的部分，
   * 关掉随机要靠这份快照还原顺序。
   */
  baseQueue: QueueItem[]
  /** 当前曲目在 queue 里的下标，-1 表示还没开始 */
  index: number
  /** 队列来源，队列页靠它跳回专辑 / 艺术家 */
  source?: PlaySource
  playMode: PlayMode
  /** 无限播放：队列快播完时自动用漫游接着放（对齐 Apple Music 的「自动播放」） */
  autoplay: boolean
  /** 歌词时间轴偏移（毫秒，正值歌词提前） */
  lyricOffsetMs: number
  setQueue(queue: QueueItem[], index: number, source?: PlaySource): void
  /** 往队尾追加（漫游续歌、无限播放用） */
  appendItems(items: QueueItem[]): void
  /** 重排后同步展示顺序（随机播放开/关都走它） */
  reorder(queue: QueueItem[], index: number): void
  setIndex(index: number): void
  setRepeat(repeat: RepeatMode): void
  setShuffle(shuffle: boolean): void
  setAutoplay(autoplay: boolean): void
  setLyricOffsetMs(offsetMs: number): void
  /** 队列页拖动排序后同步本地顺序 */
  moveItem(from: number, to: number): void
  /** 队列页删除一首后同步本地顺序 */
  removeItem(target: number): void
  patchItem(qid: string, patch: Partial<QueueItem>): void
  clear(): void
  clearHistory(): void
  /** 冷启动恢复上次会话：一次性把整套状态放回去 */
  restore(payload: RestorePayload): void
}

/** 持久化恢复时用的整套状态（restore 的入参） */
export interface RestorePayload {
  queue: QueueItem[]
  baseQueue: QueueItem[]
  index: number
  source?: PlaySource
  playMode: PlayMode
  autoplay: boolean
  lyricOffsetMs: number
}

export const usePlayerStore = create<PlayerState>((set) => ({
  queue: [],
  baseQueue: [],
  index: -1,
  playMode: DEFAULT_PLAY_MODE,
  autoplay: false,
  lyricOffsetMs: 0,
  // 换了队列就把随机关掉：新队列本来就是原始顺序，标记留着会和实际顺序不一致
  setQueue: (queue, index, source) =>
    set((state) => ({
      queue,
      baseQueue: queue,
      index,
      source,
      playMode: { ...state.playMode, shuffle: false },
    })),
  appendItems: (items) =>
    set((state) => ({ queue: [...state.queue, ...items], baseQueue: [...state.baseQueue, ...items] })),
  reorder: (queue, index) => set({ queue, index }),
  setIndex: (index) => set({ index }),
  setRepeat: (repeat) => set((state) => ({ playMode: { ...state.playMode, repeat } })),
  setShuffle: (shuffle) => set((state) => ({ playMode: { ...state.playMode, shuffle } })),
  setAutoplay: (autoplay) => set({ autoplay }),
  setLyricOffsetMs: (lyricOffsetMs) => set({ lyricOffsetMs }),
  moveItem: (from, to) =>
    set((state) => {
      if (from === to) return state
      const queue = [...state.queue]
      const moved = queue[from]
      if (!moved) return state
      queue.splice(from, 1)
      queue.splice(to, 0, moved)
      // 当前播放项可能被挪动，重新定位下标
      const current = state.index >= 0 ? state.queue[state.index] : undefined
      const index = current ? queue.findIndex((item) => item.qid === current.qid) : state.index
      return { queue, index }
    }),
  removeItem: (target) =>
    set((state) => {
      const removed = state.queue[target]
      const queue = state.queue.filter((_, i) => i !== target)
      const index = target < state.index ? state.index - 1 : state.index
      return {
        queue,
        baseQueue: removed ? state.baseQueue.filter((item) => item.qid !== removed.qid) : state.baseQueue,
        index: Math.min(index, queue.length - 1),
      }
    }),
  patchItem: (qid, patch) =>
    set((state) => ({
      queue: state.queue.map((item) => (item.qid === qid ? { ...item, ...patch } : item)),
      baseQueue: state.baseQueue.map((item) => (item.qid === qid ? { ...item, ...patch } : item)),
    })),
  restore: (payload) =>
    set(() => ({
      queue: payload.queue,
      baseQueue: payload.baseQueue,
      index: payload.index,
      source: payload.source,
      playMode: payload.playMode,
      autoplay: payload.autoplay,
      lyricOffsetMs: payload.lyricOffsetMs,
    })),
  clear: () => set({ queue: [], baseQueue: [], index: -1, source: undefined }),
  clearHistory: () =>
    set((state) => {
      if (state.index <= 0) return state
      const queue = state.queue.slice(state.index)
      const currentItem = state.queue[state.index]
      const baseQueue = currentItem
        ? state.baseQueue.filter((item) => queue.some((q) => q.qid === item.qid))
        : state.baseQueue
      return {
        queue,
        baseQueue,
        index: 0,
      }
    }),
}))

/** 当前曲目（没有则 undefined） */
export function selectCurrent(state: PlayerState): QueueItem | undefined {
  return state.index >= 0 ? state.queue[state.index] : undefined
}
