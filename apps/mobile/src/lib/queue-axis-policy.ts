import type { QueueItem } from '@qj/core-domain'

/**
 * 队列页竖轴的纯逻辑（不 import react-native / expo，可直接单测）。
 *
 * ── 竖轴模型（第 13 轮，对齐 Apple Music）─────────────────────────────────────
 * 一条竖向时间轴：过去在上、现在居中、未来在下。
 *   [历史倒序…] → 历史小标题 → 正在播放 → 随机工具栏 → [待播…]
 * 默认停在「正在播放」：历史在上方（上滑才见，末尾=上一首），待播在下方（默认可见）。
 *
 * ── 为什么历史要「倒序 + 显示上限」──────────────────────────────────────────
 * 队列页的历史是「上下文回退栈」，用户极少往回翻很远。所以：
 *   · store 存完整 200 条（收听流）；队列页只显示最近 HISTORY_VIEW_CAP 条。
 *   · 倒序：最近听的贴着「正在播放」（列表末尾=上一首），往上滑才是更早的。
 * 这样初始定位偏移量小（50×行高，不是 200×），首帧跳动无感。
 */

/** 队列页历史的显示上限（store 仍存 200，见 store 的 HISTORY_CAP） */
export const HISTORY_VIEW_CAP = 50

export interface QueueAxisView {
  /** 历史区：倒序（最近的在数组末尾，贴着正在播放），最多 HISTORY_VIEW_CAP 条 */
  history: QueueItem[]
  /** 正在播放（无则 undefined） */
  current: QueueItem | undefined
  /** 待播区：当前之后的队列 */
  upcoming: QueueItem[]
  /** 历史区有没有被上限截断（用于「仅显示最近 N 条」这类提示，可选） */
  historyTruncated: boolean
}

/**
 * 把 store 的 history/queue/index 组装成竖轴视图。
 *
 * @param history store 里的收听流（正序：最早在前、最近在后）
 * @param queue 当前队列（index 处是正在播放）
 * @param index 正在播放的下标（-1 表示还没开始）
 */
export function queueAxisView(
  history: readonly QueueItem[],
  queue: readonly QueueItem[],
  index: number,
): QueueAxisView {
  const current = index >= 0 ? queue[index] : undefined
  const upcoming = index >= 0 ? queue.slice(index + 1) : [...queue]

  // 历史 store 是正序（最早→最近）。队列页要「最近贴着正在播放」，
  // 取最近的 HISTORY_VIEW_CAP 条，保持正序（渲染时最后一条就是上一首，贴着正在播放）。
  const truncated = history.length > HISTORY_VIEW_CAP
  const recent = truncated ? history.slice(history.length - HISTORY_VIEW_CAP) : [...history]

  return {
    history: recent,
    current,
    upcoming,
    historyTruncated: truncated,
  }
}

/**
 * 竖轴的「行清单」——把三段拼成一条可虚拟化的列表数据。
 *
 * 段标记让渲染层区分：历史行不可拖、待播行可拖；正在播放/工具栏是吸顶头。
 * 顺序：历史（倒序后，最早在前、最近在末）→ 待播。
 * 「正在播放」「随机工具栏」「历史小标题」是吸顶层，不进这个可滚动数据（单独渲染）。
 */
export type QueueAxisRow =
  | { kind: 'history'; item: QueueItem; key: string }
  | { kind: 'upcoming'; item: QueueItem; queueIndex: number; key: string }
  | { kind: 'historyEmpty'; key: string }
  | { kind: 'upcomingEmpty'; key: string }

export function queueAxisRows(view: QueueAxisView, currentIndex: number): {
  historyRows: QueueAxisRow[]
  upcomingRows: QueueAxisRow[]
} {
  const historyRows: QueueAxisRow[] =
    view.history.length === 0
      ? [{ kind: 'historyEmpty', key: 'history_empty' }]
      : view.history.map((item, i) => ({ kind: 'history', item, key: `h_${item.qid}_${i}` }))

  const upcomingRows: QueueAxisRow[] =
    view.upcoming.length === 0
      ? [{ kind: 'upcomingEmpty', key: 'upcoming_empty' }]
      : view.upcoming.map((item, i) => ({
          kind: 'upcoming',
          item,
          // 在 store.queue 里的真实下标：当前 index 之后第 i+1 个
          queueIndex: currentIndex + 1 + i,
          key: `u_${item.qid}_${i}`,
        }))

  return { historyRows, upcomingRows }
}
