import { create } from 'zustand'
import type { PlayMode, QueueItem, RepeatMode } from '@qj/core-domain'
import { DEFAULT_PLAY_MODE } from '@qj/core-domain'

interface PlayerState {
  /** 与 RNTP 队列一一对应的展示数据（锁屏、迷你条、正在播放页都读它） */
  queue: QueueItem[]
  /** 当前曲目在 queue 里的下标，-1 表示还没开始 */
  index: number
  /** 播放来源描述，例如「专辑 · 范特西」 */
  sourceLabel?: string
  playMode: PlayMode
  /** 歌词时间轴偏移（毫秒，正值歌词提前） */
  lyricOffsetMs: number
  setQueue(queue: QueueItem[], index: number, sourceLabel?: string): void
  setIndex(index: number): void
  setRepeat(repeat: RepeatMode): void
  setShuffle(shuffle: boolean): void
  setLyricOffsetMs(offsetMs: number): void
  clear(): void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  queue: [],
  index: -1,
  playMode: DEFAULT_PLAY_MODE,
  lyricOffsetMs: 0,
  setQueue: (queue, index, sourceLabel) => set({ queue, index, sourceLabel }),
  setIndex: (index) => set({ index }),
  setRepeat: (repeat) => set((state) => ({ playMode: { ...state.playMode, repeat } })),
  setShuffle: (shuffle) => set((state) => ({ playMode: { ...state.playMode, shuffle } })),
  setLyricOffsetMs: (lyricOffsetMs) => set({ lyricOffsetMs }),
  clear: () => set({ queue: [], index: -1, sourceLabel: undefined }),
}))

/** 当前曲目（没有则 undefined） */
export function selectCurrent(state: PlayerState): QueueItem | undefined {
  return state.index >= 0 ? state.queue[state.index] : undefined
}
