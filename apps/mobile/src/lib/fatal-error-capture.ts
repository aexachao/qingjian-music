/**
 * 启动期致命错误的捕获与展示（纯逻辑，不 import react-native / expo，可直接单测）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * Android release 包闪退时屏幕上什么都不留。而当时的处境是：本机没有 Android
 * 构建环境、测试机是 Android 9（没有「无线调试」，那是 Android 11+ 的功能）、
 * 手上的 micro-USB 线还不能传数据 —— 拿不到 logcat。
 * 让 App 自己把错误显示在屏幕上，是唯一不依赖外部工具的路径。
 *
 * 它同时有**诊断**价值：显示了错误 = **JS 层**问题；仍然直接闪退、什么都不显示 =
 * **原生层**崩溃。这两类的修法完全不同，而这一条不用 adb 就能区分。
 *
 * ── 与 Error Boundary 的分工 ────────────────────────────────────────────────
 * 两者都要，因为它们覆盖的时机不同：
 *   · `installGlobalErrorHandler` 捕获**未捕获的 JS 异常**，包括 React 挂载之前
 *     发生的（模块初始化抛错）—— 那时还没有任何组件，Boundary 无从谈起；
 *   · Error Boundary 捕获**渲染期**异常，能拿到组件栈。
 * 所以入口文件要在最前面装全局处理器，而根布局导出 Boundary。
 */

export interface FatalErrorInfo {
  message: string
  stack?: string
  /** `uncaught` 未捕获的 JS 异常；`render` 渲染期异常（Error Boundary 捕获） */
  source: 'uncaught' | 'render'
  /** 毫秒时间戳，由调用方传入（保持本模块无副作用、可测） */
  at: number
}

/** 手机上展示空间有限，而崩溃点几乎总在最上面几帧 */
export const STACK_LINE_LIMIT = 14

/** 把任意抛出物归一化成可展示的信息。纯函数。 */
export function formatFatalError(
  error: unknown,
  source: FatalErrorInfo['source'],
  at: number,
): FatalErrorInfo {
  if (error instanceof Error) {
    // message 可能为空串（某些库抛 `new Error()`），退回 name 再退回兜底文案
    const message = error.message || error.name || '未知错误（Error 无 message）'
    return { message, stack: error.stack, source, at }
  }
  if (typeof error === 'string') return { message: error, source, at }
  try {
    // JSON.stringify 对 undefined / function / symbol 返回的是 **undefined 值**而非字符串，
    // 直接赋给 message 会让错误屏显示一片空白 —— 那正是本模块要避免的情形。
    const json = JSON.stringify(error)
    return { message: json === undefined ? String(error) : json, source, at }
  } catch {
    // 循环引用等让 JSON.stringify 抛错的情况
    return { message: String(error), source, at }
  }
}

/** 堆栈截断成可展示的行数组。纯函数。 */
export function trimStack(stack: string | undefined, limit = STACK_LINE_LIMIT): string[] {
  if (!stack) return []
  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
}

// ── 状态 ─────────────────────────────────────────────────────────────────────
// 刻意做成模块级单例：错误可能发生在任何地方，没有合适的 React 上下文可以承载它。

let current: FatalErrorInfo | null = null
const listeners = new Set<(info: FatalErrorInfo | null) => void>()

function emit(): void {
  for (const listener of listeners) listener(current)
}

/** 记录一个致命错误并通知订阅者。**第一个错误胜出** —— 后续错误通常是它的连锁反应 */
export function reportFatalError(
  error: unknown,
  source: FatalErrorInfo['source'],
  at: number,
): FatalErrorInfo {
  const info = formatFatalError(error, source, at)
  if (current === null) {
    current = info
    emit()
  }
  return info
}

export function getFatalError(): FatalErrorInfo | null {
  return current
}

export function clearFatalError(): void {
  current = null
  emit()
}

export function subscribeFatalError(listener: (info: FatalErrorInfo | null) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 仅供单测：重置模块级状态 */
export function __resetFatalErrorForTest(): void {
  current = null
  listeners.clear()
}

interface ErrorUtilsLike {
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void
}

/**
 * 装上全局未捕获异常处理器。
 *
 * **刻意不转发给上一个处理器**：RN 默认处理器在 release 下会直接终止进程，
 * 那样错误就永远显示不出来 —— 而「把错误显示出来」正是本模块存在的全部理由。
 * 代价是进程会带着一个可能已损坏的状态继续存活，所以错误屏只提供「重试」，
 * 不提供「忽略并继续」。
 *
 * @returns 是否安装成功（拿不到 ErrorUtils 时返回 false，调用方无需处理）
 */
export function installGlobalErrorHandler(now: () => number = Date.now): boolean {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils
  if (!utils?.setGlobalHandler) return false
  utils.setGlobalHandler((error: unknown) => {
    reportFatalError(error, 'uncaught', now())
  })
  return true
}
