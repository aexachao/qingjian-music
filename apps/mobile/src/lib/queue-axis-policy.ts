import type { QueueItem } from '@qj/core-domain'

/**
 * 队列页竖轴的纯逻辑（不 import react-native / expo，可直接单测）。
 *
 * ── 三模块竖轴模型（第 13 轮，对齐 Apple Music，用 SectionList 承载）──────────────
 * 三个 section 从上到下、间距 0：
 *   1. 历史（sticky 标题「历史记录」+ 历史行）
 *   2. 正在播放（卡片一行，无 sticky 标题）
 *   3. 待播（sticky 标题 = 随机工具栏 + 待播行）
 * 默认定位到「正在播放」：历史在上方（下滑才见，标题先吸顶、行从标题下滑出），
 * 待播在下方（默认可见）。上滑时正在播放卡随内容滚走、随机工具栏吸顶（用户选的「后者」）。
 *
 * ── 为什么历史要「显示上限」──────────────────────────────────────────────────
 * 队列页的历史是「回退栈」，用户极少往回翻很远。store 存完整 200 条（收听流），
 * 队列页只显示最近 HISTORY_VIEW_CAP 条，初始定位偏移量小、首帧不跳。
 */

/** 队列页历史的显示上限（store 仍存 200，见 store 的 HISTORY_CAP） */
export const HISTORY_VIEW_CAP = 50

export type QueueAxisRow =
  | { kind: 'history'; item: QueueItem; key: string }
  | { kind: 'current'; item: QueueItem; key: string }
  | { kind: 'upcoming'; item: QueueItem; queueIndex: number; key: string }
  | { kind: 'upcomingEmpty'; key: string }

export type QueueSectionKind = 'history' | 'current' | 'upcoming'

export interface QueueSection {
  key: QueueSectionKind
  data: QueueAxisRow[]
}

export interface QueueAxisView {
  sections: QueueSection[]
  /** 「正在播放」section 在 sections 里的下标（初始滚动定位到它）；无当前曲目时为 -1 */
  currentSectionIndex: number
  /** 历史是否被上限截断 */
  historyTruncated: boolean
  /** 历史行数（视口显示的，最多 HISTORY_VIEW_CAP） */
  historyCount: number
  /** 待播行数 */
  upcomingCount: number
}

/**
 * 把 store 的 history/queue/index 组装成 SectionList 的 sections。
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

  // 历史 store 是正序（最早→最近）。取最近的 HISTORY_VIEW_CAP 条，保持正序：
  // SectionList 里历史行按此顺序渲染，最后一条（最近=上一首）贴着「正在播放」上方。
  const truncated = history.length > HISTORY_VIEW_CAP
  const recentHistory = truncated ? history.slice(history.length - HISTORY_VIEW_CAP) : [...history]

  const sections: QueueSection[] = []

  // 只有在有正在播放时才显示历史 section（否则没有「回退栈」的语义）
  if (current && recentHistory.length > 0) {
    sections.push({
      key: 'history',
      data: recentHistory.map((item, i) => ({ kind: 'history', item, key: `h_${item.qid}_${i}` })),
    })
  }

  const currentSectionIndex = current ? sections.length : -1
  if (current) {
    sections.push({ key: 'current', data: [{ kind: 'current', item: current, key: `c_${current.qid}` }] })
  }

  sections.push({
    key: 'upcoming',
    data:
      upcoming.length === 0
        ? [{ kind: 'upcomingEmpty', key: 'upcoming_empty' }]
        : upcoming.map((item, i) => ({
            kind: 'upcoming',
            item,
            queueIndex: index + 1 + i,
            key: `u_${item.qid}_${i}`,
          })),
  })

  return {
    sections,
    currentSectionIndex,
    historyTruncated: truncated,
    historyCount: recentHistory.length,
    upcomingCount: upcoming.length,
  }
}
