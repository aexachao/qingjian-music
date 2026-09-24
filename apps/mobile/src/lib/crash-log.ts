import type { FatalErrorInfo } from './fatal-error-capture'

/**
 * 崩溃日志的纯逻辑（不 import react-native / expo，可直接单测）。
 *
 * ── 为什么要落盘 ────────────────────────────────────────────────────────────
 * 已有的 `fatal-error-capture` 只把错误放在内存里、显示在错误屏上。可测试的人
 * 在真机上崩溃后，错误屏一关、或 App 被系统杀掉，信息就没了 —— 收集不到。
 * 落盘后，崩溃信息在下次启动仍能从「设置 → 崩溃日志」里查看、复制、分享。
 *
 * ── 覆盖范围 ────────────────────────────────────────────────────────────────
 * 只能收 **JS 层**崩溃（未捕获异常 + 渲染期异常，与错误屏同源）。**原生层崩溃**
 * （Hermes/原生模块）JS 抓不到 —— 那类走 TestFlight/Xcode 的系统崩溃报告。
 */

export interface CrashLogEntry {
  message: string
  stack?: string
  source: FatalErrorInfo['source']
  /** 毫秒时间戳 */
  at: number
  /** 发行版 / 版本，便于区分构建 */
  appVersion?: string
  buildNumber?: string
}

/** 最多保留多少条（本地文件，不宜无限增长；崩溃点几乎总在最近几条） */
export const CRASH_LOG_CAP = 30

/** 把一条致命错误信息转成可落盘的日志条目。纯函数。 */
export function toCrashLogEntry(
  info: FatalErrorInfo,
  meta: { appVersion?: string; buildNumber?: string } = {},
): CrashLogEntry {
  return {
    message: info.message,
    ...(info.stack ? { stack: info.stack } : {}),
    source: info.source,
    at: info.at,
    ...(meta.appVersion ? { appVersion: meta.appVersion } : {}),
    ...(meta.buildNumber ? { buildNumber: meta.buildNumber } : {}),
  }
}

/** 追加一条，超过上限从最旧的丢。纯函数（新数组）。 */
export function appendCrashLog(list: readonly CrashLogEntry[], entry: CrashLogEntry): CrashLogEntry[] {
  const next = [...list, entry]
  return next.length > CRASH_LOG_CAP ? next.slice(next.length - CRASH_LOG_CAP) : next
}

/** 把日志解析成数组，坏数据一律回空（不让脏文件把「查看崩溃」自己搞崩）。纯函数。 */
export function parseCrashLog(raw: string | null | undefined): CrashLogEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is CrashLogEntry =>
        e && typeof e.message === 'string' && typeof e.at === 'number',
    )
  } catch {
    return []
  }
}

/** 一条日志格式化成可读文本（复制/分享用）。纯函数。 */
export function formatCrashEntryText(entry: CrashLogEntry): string {
  const time = new Date(entry.at).toLocaleString('zh-CN', { hour12: false })
  const head = [
    `时间: ${time}`,
    `类型: ${entry.source === 'render' ? '渲染期异常' : '未捕获异常'}`,
    entry.buildNumber ? `构建: ${entry.appVersion ?? ''} (${entry.buildNumber})` : '',
    '',
    entry.message,
  ].filter(Boolean)
  const stack = entry.stack ? ['', entry.stack] : []
  return [...head, ...stack].join('\n')
}

/** 整份日志拼成一段文本（最近的在最上），供一键复制/分享全部。纯函数。 */
export function formatCrashLogText(list: readonly CrashLogEntry[]): string {
  if (list.length === 0) return '（无崩溃记录）'
  return [...list]
    .reverse()
    .map((e, i) => `— 第 ${i + 1} 条 —\n${formatCrashEntryText(e)}`)
    .join('\n\n────────────────\n\n')
}
