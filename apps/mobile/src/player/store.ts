import { create } from 'zustand'
import type { PlayMode, PlaySource, QueueItem, RepeatMode } from '@qj/core-domain'
import { DEFAULT_PLAY_MODE } from '@qj/core-domain'

interface PlayerState {
  /** 与 RNTP 队列一一对应：当前曲目固定在 0，后面是稳定的待播列表。 */
  queue: QueueItem[]
  /** 已经离开“正在播放”的 occurrence 日志；允许同一曲目重复出现。 */
  history: QueueItem[]
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
  /** 插入到当前曲目之后（「下一首播放」） */
  insertAfterCurrent(items: QueueItem[]): void
  /** 重排后同步展示顺序（随机播放开/关都走它） */
  reorder(queue: QueueItem[], index: number): void
  setIndex(index: number): void
  /** RNTP 活跃项变化时，把离开的当前项追加历史，并把新当前项移到队头。 */
  activateIndex(index: number): void
  /** 从历史点播：历史不变，新 occurrence 成为当前，原当前追加到历史。 */
  activateHistoryItem(item: QueueItem, qid: string): void
  /** 从历史中恢复上一首：弹出历史末尾项置于队头，原当前曲目与待播列表顺延。 */
  restorePreviousTrack(item: QueueItem): void
  setRepeat(repeat: RepeatMode): void
  setShuffle(shuffle: boolean): void
  setAutoplay(autoplay: boolean): void
  setLyricOffsetMs(offsetMs: number): void
  /** 队列页拖动排序后同步本地顺序 */
  moveItem(from: number, to: number): void
  /** 队列页删除一首后同步本地顺序 */
  removeItem(target: number): void
  /** 队列页「清空待播」：只丢掉当前曲目之后的部分，当前曲目继续播放 */
  clearUpcoming(): void
  patchItem(trackId: string, patch: Partial<QueueItem>): void
  clear(): void
  clearHistory(): void
  /** 冷启动恢复上次会话：一次性把整套状态放回去 */
  restore(payload: RestorePayload): void
  /** 播放是否已在队尾自然播完停在 100% */
  playbackEnded: boolean
  setPlaybackEnded(ended: boolean): void
  appendHistoryItem(item: QueueItem): void
  /** 音频是否正在加载/解码中（用于在播放/暂停按钮呈现 loading 状态） */
  isLoadingAudio: boolean
  setIsLoadingAudio(loading: boolean): void
}

/** 持久化恢复时用的整套状态（restore 的入参） */
export interface RestorePayload {
  queue: QueueItem[]
  history?: QueueItem[]
  baseQueue: QueueItem[]
  index: number
  source?: PlaySource
  playMode: PlayMode
  autoplay: boolean
  lyricOffsetMs: number
}

function appendHistoryOccurrence(history: QueueItem[], item: QueueItem | undefined): QueueItem[] {
  if (!item || history.some((entry) => entry.qid === item.qid)) return history
  return [...history, item]
}

export const usePlayerStore = create<PlayerState>((set) => ({
  queue: [],
  history: [],
  baseQueue: [],
  index: -1,
  playMode: DEFAULT_PLAY_MODE,
  autoplay: false,
  lyricOffsetMs: 0,
  playbackEnded: false,
  setPlaybackEnded: (playbackEnded) => set({ playbackEnded }),
  isLoadingAudio: false,
  setIsLoadingAudio: (isLoadingAudio) => set({ isLoadingAudio }),
  appendHistoryItem: (item) =>
    set((state) => ({
      history: appendHistoryOccurrence(state.history, item),
    })),
  // 换了队列就把随机关掉：新队列本来就是原始顺序，标记留着会和实际顺序不一致
  setQueue: (queue, index, source) =>
    set((state) => ({
      queue,
      history: [],
      baseQueue: queue,
      index,
      source,
      playbackEnded: false,
      playMode: { ...state.playMode, shuffle: false },
    })),
  appendItems: (items) =>
    set((state) => ({ queue: [...state.queue, ...items], baseQueue: [...state.baseQueue, ...items] })),
  insertAfterCurrent: (items) =>
    set((state) => {
      const insertAt = state.index + 1
      const before = state.queue.slice(0, insertAt)
      const after = state.queue.slice(insertAt)
      const next = [...before, ...items, ...after]
      return { queue: next, baseQueue: next }
    }),
  reorder: (queue, index) => set({ queue, index }),
  setIndex: (index) => set({ index, playbackEnded: false }),
  activateIndex: (target) =>
    set((state) => {
      if (target < 0 || target >= state.queue.length || target === state.index) return state
      const current = state.index >= 0 ? state.queue[state.index] : undefined
      const selected = state.queue[target]
      if (!selected) return state

      const isRepeatQueue = state.playMode.repeat === 'queue'
      let queue: QueueItem[]
      if (isRepeatQueue && current) {
        // 列表循环模式：当前播完的歌曲回到队尾
        queue = [
          selected,
          ...state.queue.filter((_, itemIndex) => itemIndex !== target && itemIndex !== state.index),
          current,
        ]
      } else {
        queue = [
          selected,
          ...state.queue.filter((_, itemIndex) => itemIndex !== target && itemIndex !== state.index),
        ]
      }
      const remainingIds = new Set(queue.map((item) => item.qid))
      return {
        queue,
        baseQueue: state.baseQueue.filter((item) => remainingIds.has(item.qid)),
        history: appendHistoryOccurrence(state.history, current),
        index: 0,
        playbackEnded: false,
      }
    }),
  activateHistoryItem: (item, qid) =>
    set((state) => {
      const current = state.index >= 0 ? state.queue[state.index] : undefined
      const queue = [{ ...item, qid }, ...state.queue.filter((_, itemIndex) => itemIndex !== state.index)]
      return {
        queue,
        baseQueue: queue,
        history: appendHistoryOccurrence(state.history, current),
        index: 0,
        playbackEnded: false,
      }
    }),
  restorePreviousTrack: (restoredItem) =>
    set((state) => {
      if (state.history.length === 0) return state
      const history = state.history.slice(0, -1)
      const queue = [restoredItem, ...state.queue]
      return {
        queue,
        baseQueue: [restoredItem, ...state.baseQueue],
        history,
        index: 0,
        playbackEnded: false,
      }
    }),
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
  patchItem: (trackId, patch) =>
    set((state) => ({
      queue: state.queue.map((item) => (item.trackId === trackId ? { ...item, ...patch } : item)),
      history: state.history.map((item) => (item.trackId === trackId ? { ...item, ...patch } : item)),
      baseQueue: state.baseQueue.map((item) => (item.trackId === trackId ? { ...item, ...patch } : item)),
    })),
  clearUpcoming: () =>
    set((state) => {
      // index < 0 表示还没开始播放，此时「待播」就是整个队列
      const keepCount = state.index >= 0 ? state.index + 1 : 0
      // 没有待播时保持原引用，避免触发无意义的重渲染
      if (keepCount >= state.queue.length) return state
      const keep = state.queue.slice(0, keepCount)
      const keepIds = new Set(keep.map((item) => item.qid))
      // baseQueue 是关闭随机播放时用来还原顺序的快照，必须同步裁掉已移除的项，
      // 否则下次关随机会把已经清掉的歌又「还原」回来
      return { queue: keep, baseQueue: state.baseQueue.filter((item) => keepIds.has(item.qid)) }
    }),
  restore: (payload) =>
    set(() => {
      const history = payload.history ?? payload.queue.slice(0, payload.index)
      const current = payload.queue[payload.index]
      const upcoming = payload.queue.filter((_, itemIndex) => itemIndex > payload.index)
      const queue = current ? [current, ...upcoming] : payload.queue
      return {
        queue,
        history,
        baseQueue: queue,
        index: queue.length > 0 ? 0 : -1,
        source: payload.source,
        playMode: payload.playMode,
        autoplay: payload.autoplay,
        lyricOffsetMs: payload.lyricOffsetMs,
      }
    }),
  clear: () => set({ queue: [], history: [], baseQueue: [], index: -1, source: undefined, isLoadingAudio: false }),
  clearHistory: () => set({ history: [] }),
}))

/** 当前曲目（没有则 undefined） */
export function selectCurrent(state: PlayerState): QueueItem | undefined {
  return state.index >= 0 ? state.queue[state.index] : undefined
}
