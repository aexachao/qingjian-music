/**
 * 多选（列表选择态）的纯逻辑：选中集合的增删、全选、顶部条文案。
 * 不 import react-native / expo，可直接单测。
 *
 * ── 为什么「全选」只选已加载的 ──────────────────────────────────────────────
 * 列表是分页的（50/页，曲库有 4 万首）。「全选」只能选**当前已加载**的那些 ——
 * 想选整个列表就得让服务端支持批量编辑，现在没有。所以文案必须写清范围
 * （`全选（已加载 N 首）`），不能让用户以为他选了四万首。
 */

/** 切换一首的选中状态。保持顺序（先选的在前），便于「播放」按用户的选择顺序组队列 */
export function toggleSelected(selected: readonly string[], id: string): readonly string[] {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
}

export function isSelected(selected: readonly string[], id: string): boolean {
  return selected.includes(id)
}

/** 候选集（当前已加载的曲目）是不是全被选中了。候选为空时**不算**全选，避免「0 选中显示已全选」 */
export function isAllSelected(selected: readonly string[], candidates: readonly string[]): boolean {
  return candidates.length > 0 && candidates.every((id) => selected.includes(id))
}

/**
 * 全选 / 取消全选。取消时**只清掉候选集里的那些** —— 已加载集合变了（比如加载了下一页）
 * 之后仍然语义正确，也不会顺手丢掉用户跨页选中的（虽然当前 UI 不产生这种状态）。
 */
export function toggleAll(selected: readonly string[], candidates: readonly string[]): readonly string[] {
  if (isAllSelected(selected, candidates)) {
    return selected.filter((id) => !candidates.includes(id))
  }
  const merged = [...selected]
  for (const id of candidates) {
    if (!merged.includes(id)) merged.push(id)
  }
  return merged
}

/** 顶部条上的已选数量：`3 首`（2026-09-15 晚按你的要求：不再写「已选 N 首」「已加载 N 首」）*/
export function selectionCountText(count: number): string {
  return `${count} 首`
}

/** 「全选」那一行左边的图标三态 */
export type SelectionState = 'none' | 'partial' | 'all'

/**
 * 三态判定：一个都没选 / 选了一部分 / 候选集全选。
 * 候选集为空时是 `none`（不是 `all`）—— 否则空列表会显示成「已全选」。
 */
export function selectionState(
  selected: readonly string[],
  candidates: readonly string[],
): SelectionState {
  if (selected.length === 0 || candidates.length === 0) return 'none'
  return isAllSelected(selected, candidates) ? 'all' : 'partial'
}

/** 「全选」的标签：固定两个字，范围提示挪到计数上（`N 首`）*/
export const SELECT_ALL_LABEL = '全选'
