import { Directory, File, Paths } from 'expo-file-system'
import type { FatalErrorInfo } from './fatal-error-capture'
import { subscribeFatalError } from './fatal-error-capture'
import {
  appendCrashLog,
  parseCrashLog,
  toCrashLogEntry,
  type CrashLogEntry,
} from './crash-log'

/**
 * 崩溃日志的持久化层（真机可查/可复制/可分享）。
 *
 * 放在 document 目录（不是 cache —— cache 会被系统清）。崩溃发生时我们的全局
 * 处理器不 rethrow、进程继续存活，所以异步写盘通常能落成。
 */
const CRASH_DIR = new Directory(Paths.document, 'qj')
const CRASH_FILE = new File(CRASH_DIR, 'crash-log.json')

let meta: { appVersion?: string; buildNumber?: string } = {}

/** 设置版本元信息（在 app 启动时调一次），写日志时带上，便于区分构建 */
export function setCrashLogMeta(m: { appVersion?: string; buildNumber?: string }): void {
  meta = m
}

function readRaw(): string | null {
  try {
    if (!CRASH_FILE.exists) return null
    return CRASH_FILE.textSync()
  } catch {
    return null
  }
}

export function readCrashLogs(): CrashLogEntry[] {
  return parseCrashLog(readRaw())
}

function persist(entry: CrashLogEntry): void {
  try {
    if (!CRASH_DIR.exists) CRASH_DIR.create({ intermediates: true })
    const next = appendCrashLog(parseCrashLog(readRaw()), entry)
    CRASH_FILE.write(JSON.stringify(next))
  } catch {
    // 写盘失败不致命：崩溃屏本身仍会显示这次错误
  }
}

export function clearCrashLogs(): void {
  try {
    if (CRASH_FILE.exists) CRASH_FILE.write('[]')
  } catch {
    // 忽略
  }
}

let installed = false

/**
 * 订阅致命错误 → 落盘。应在 app 入口尽早调用（在 installGlobalErrorHandler 之后）。
 * 与错误屏、原生弹窗并列，是第三个消费者：它负责「持久化收集」。
 */
export function installCrashLogPersistence(): void {
  if (installed) return
  installed = true
  subscribeFatalError((info: FatalErrorInfo | null) => {
    if (!info) return
    persist(toCrashLogEntry(info, meta))
  })
}
