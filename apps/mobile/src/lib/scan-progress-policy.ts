import type { BackgroundTask } from '@qj/core-domain'

/**
 * 扫描进度的纯逻辑（不 import react-native / expo，可直接单测）。
 *
 * 百分比的做法（对齐飞牛）：飞牛后台就是按 `已扫描数 / 总数` 算百分比并显示的。
 * fileScan 的 `total` 是边扫边长的（0 → 69 → … → 34 338），所以百分比也会跟着变
 * —— 这是正常的，总数固定下来百分比才稳定。已处理数追上总数（且未 done）→「正在整理」
 * （百分比到 100%）；`done` → 完成。
 */

export type ScanPhase = 'scanning' | 'finalizing' | 'done' | 'idle'

export interface ScanProgressView {
  phase: ScanPhase
  /** 已扫描文件数（successCount + failCount，= 已处理总数） */
  processed: number
  /** 当前分母（total，边扫边长） */
  total: number
  /** 百分比 0~100（= processed/total，向下取整）；total 为 0 时为 0 */
  percent: number
  /** 失败数（1~2 正常，不当异常报错） */
  failed: number
  /** 一行主文案 */
  label: string
  /** 失败提示（无失败时为空串） */
  failedLabel: string
}

/** 找出某个库当前正在跑的 fileScan 任务（done 的排后面，优先返回未完成的） */
export function findScanTask(
  tasks: readonly BackgroundTask[],
  libraryId: string,
): BackgroundTask | undefined {
  const forLibrary = tasks.filter((t) => t.type === 'fileScan' && t.libraryId === libraryId)
  return forLibrary.find((t) => !t.done && !t.canceled) ?? forLibrary[0]
}

/** 是否有任意正在进行的扫描（用于「扫描中」的全局态） */
export function hasActiveScan(tasks: readonly BackgroundTask[]): boolean {
  return tasks.some((t) => t.type === 'fileScan' && !t.done && !t.canceled)
}

/** 数字千分位（34338 → 34,338） */
function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

/** 百分比：processed/total 向下取整，限在 0~100；total<=0 给 0 */
function percentOf(processed: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.floor((processed / total) * 100))
}

/**
 * 把任务映射成一屏进度文案（纯函数，无跨渲染状态）。
 *
 * 百分比按飞牛的做法 = 已处理数/总数；总数边扫边长所以百分比会变，正常。
 * 「正在整理」用数据自身判定：已处理数追上总数（且未 done）。
 */
export function scanProgressView(task: BackgroundTask | undefined): ScanProgressView {
  if (!task) {
    return { phase: 'idle', processed: 0, total: 0, percent: 0, failed: 0, label: '', failedLabel: '' }
  }

  const processed = task.successCount + task.failCount
  const percent = percentOf(processed, task.total)
  const failedLabel = task.failCount > 0 ? `${formatCount(task.failCount)} 个文件未能识别` : ''

  if (task.canceled) {
    return { phase: 'idle', processed, total: task.total, percent, failed: task.failCount, label: '扫描已取消', failedLabel }
  }

  if (task.done) {
    return {
      phase: 'done',
      processed,
      total: task.total,
      percent: 100,
      failed: task.failCount,
      label: `扫描完成，共 ${formatCount(task.total)} 个文件`,
      failedLabel,
    }
  }

  // 已处理数追上总数（且总数 > 0）→ 文件已找全，正在整理；否则还在扫
  if (task.total > 0 && processed >= task.total) {
    return {
      phase: 'finalizing',
      processed,
      total: task.total,
      percent: 100,
      failed: task.failCount,
      label: `文件已找全（${formatCount(task.total)} 个），正在整理…`,
      failedLabel,
    }
  }

  return {
    phase: 'scanning',
    processed,
    total: task.total,
    percent,
    failed: task.failCount,
    label: `正在扫描 ${formatCount(processed)} / ${formatCount(task.total)}（${percent}%）`,
    failedLabel,
  }
}

/** 库的显示名：飞牛的 name 可能是空串，退回路径末段，再退回「音乐库」 */
export function libraryDisplayName(name: string, path: string): string {
  if (name.trim()) return name
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] || '音乐库'
}

/**
 * 「最近更新」时间文案，精确到分钟（unix 秒 → `最近更新 09-20 14:32`）。
 * 无时间戳时返回空串，交给 UI 兜底。
 */
export function libraryUpdatedLabel(contentLastChangedAt: number | undefined, now: Date = new Date()): string {
  if (!contentLastChangedAt || contentLastChangedAt <= 0) return ''
  const d = new Date(contentLastChangedAt * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const sameYear = d.getFullYear() === now.getFullYear()
  const date = sameYear
    ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `最近更新 ${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
