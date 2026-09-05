import { create } from 'zustand'
import type { PlayMode, PlaySource, QueueItem, RepeatMode } from '@qj/core-domain'
import { DEFAULT_PLAY_MODE } from '@qj/core-domain'

interface PlayerState {
  /** 与 RNTP 队列一一对应的展示数据（锁屏、迷你条、正在播放页、队列页都读它） */
  queue: QueueItem[]
  /** 当前曲目在 queue 里的下标，-1 表示还没开始 */
  index: number
  /** 队列来源，队列页靠它跳回专辑 / 艺术家 */
  source?: PlaySource
  playMode: PlayMode
  /** 歌词时间轴偏移（毫秒，正值歌词提前） */
  lyricOffsetMs: number
  setQueue(queue: QueueItem[], index: number, source?: PlaySource): void
  /** 往队尾追加（漫游电台边听边续用） */
  appendItems(items: QueueItem[]): void
  setIndex(index: number): void
  setRepeat(repeat: RepeatMode): void
  setShuffle(shuffle: boolean): void
  setLyricOffsetMs(offsetMs: number): void
  /** 队列页拖动排序后同步本地顺序 */
  moveItem(from: number, to: number): void
  /** 队列页删除一首后同步本地顺序 */
  removeItem(target: number): void
  patchItem(qid: string, patch: Partial<QueueItem>): void
  clear(): void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  queue: [],
  index: -1,
  playMode: DEFAULT_PLAY_MODE,
  lyricOffsetMs: 0,
  setQueue: (queue, index, source) => set({ queue, index, source }),
  appendItems: (items) => set((state) => ({ queue: [...state.queue, ...items] })),
  setIndex: (index) => set({ index }),
  setRepeat: (repeat) => set((state) => ({ playMode: { ...state.playMode, repeat } })),
  setShuffle: (shuffle) => set((state) => ({ playMode: { ...state.playMode, shuffle } })),
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
      const queue = state.queue.filter((_, i) => i !== target)
      const index = target < state.index ? state.index - 1 : state.index
      return { queue, index: Math.min(index, queue.length - 1) }
    }),
  patchItem: (qid, patch) =>
    set((state) => ({
      queue: state.queue.map((item) => (item.qid === qid ? { ...item, ...patch } : item)),
    })),
  clear: () => set({ queue: [], index: -1, source: undefined }),
}))

/** 当前曲目（没有则 undefined） */
export function selectCurrent(state: PlayerState): QueueItem | undefined {
  return state.index >= 0 ? state.queue[state.index] : undefined
}
