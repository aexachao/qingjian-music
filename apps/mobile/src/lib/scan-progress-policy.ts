import type { BackgroundTask } from '@qj/core-domain'

/**
 * 扫描进度的纯逻辑（不 import react-native / expo，可直接单测）。
 *
 * ── 一个关键事实（实测，见 docs/fnos-music-api.md）──────────────────────────
 * fileScan 任务的 `total` 是**边扫边长**的（0 → 69 → … → 34 338），**没有百分比字段**。
 * 所以百分比在扫描早期没有意义（分母一直变大，百分比会「往回跳」）。做法对齐飞牛：
 * 分母还在涨 → 显示「已扫描 N 个文件」这类计数；分母停下来 → 说明文件已找全，
 * 切成「正在整理」；`done` → 完成。
 */

export type ScanPhase = 'scanning' | 'finalizing' | 'done' | 'idle'

export interface ScanProgressView {
  phase: ScanPhase
  /** 已扫描文件数（successCount + failCount，= 已处理总数） */
  processed: number
  /** 当前分母（total，仅供展示，不用来算百分比） */
  total: number
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

/**
 * 把任务映射成一屏进度文案（纯函数，无跨渲染状态）。
 *
 * 「正在整理」的判定：不靠跨渲染历史（那要 ref，会在 render 期间读写），
 * 改用数据自身的信号：已处理数追上总数（successCount + failCount >= total）但任务未 done，
 * 就是「文件已找全、正在整理」。否则处理数 < 总数 → 还在扫。
 */
export function scanProgressView(task: BackgroundTask | undefined): ScanProgressView {
  if (!task) {
    return { phase: 'idle', processed: 0, total: 0, failed: 0, label: '', failedLabel: '' }
  }

  const processed = task.successCount + task.failCount
  const failedLabel = task.failCount > 0 ? `${formatCount(task.failCount)} 个文件未能识别` : ''

  if (task.canceled) {
    return { phase: 'idle', processed, total: task.total, failed: task.failCount, label: '扫描已取消', failedLabel }
  }

  if (task.done) {
    return {
      phase: 'done',
      processed,
      total: task.total,
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
      failed: task.failCount,
      label: `文件已找全（${formatCount(task.total)} 个），正在整理…`,
      failedLabel,
    }
  }

  return {
    phase: 'scanning',
    processed,
    total: task.total,
    failed: task.failCount,
    label: `正在扫描，已发现 ${formatCount(task.total)} 个文件`,
    failedLabel,
  }
}

/** 库的显示名：飞牛的 name 可能是空串，退回路径末段，再退回「音乐库」 */
export function libraryDisplayName(name: string, path: string): string {
  if (name.trim()) return name
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] || '音乐库'
}
