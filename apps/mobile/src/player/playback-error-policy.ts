/**
 * RNTP `PlaybackError` 事件的负载形状归一化 + 失败归因。
 *
 * ── 为什么需要这一层 ────────────────────────────────────────────────────────
 * RNTP 4.1.2 的同一个事件在两端**字段名不一样**（读它的原生源码确认）：
 *
 *   iOS     `ios/RNTrackPlayer/RNTrackPlayer.swift`
 *           `emit(event: EventType.PlaybackError, body: ["error": error?.localizedDescription])`
 *           → `{ error: string }`
 *
 *   Android `android/.../service/MusicService.kt` → `getPlaybackErrorBundle()`
 *           → `{ message: string, code: 'android-' + code }`
 *
 * 而 JS 侧的类型声明是 `{ code: string; message: string }`，且 `useTrackPlayerEvents`
 * 把原生负载**原样透传、不做任何归一化**。于是：
 *   - iOS 上 `event.code` / `event.message` **恒为 undefined**，
 *     日志只会打出 `播放失败 undefined undefined`，错误分支拿不到任何可用于判定的信息；
 *   - Android 上能拿到 message，但没有 iOS 那份文案。
 *
 * 结论：**不能直接读 `event.code` / `event.message`**，必须先归一化。
 * 这是「日志里什么都看不出来」的根因，也是错误分支无法区分失败原因的原因。
 */

export interface NormalizedPlaybackError {
  /** 仅 Android 提供，形如 `android-<Media3 code>` */
  code?: string
  /** 归一化后的可读文案（iOS 取 `error`，Android 取 `message`） */
  message?: string
  /** 原始负载，日志用；两端字段不同，别直接读 */
  raw: Record<string, unknown>
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function normalizePlaybackError(payload: unknown): NormalizedPlaybackError {
  const raw = (payload ?? {}) as Record<string, unknown>
  const code = asText(raw.code)
  const message = asText(raw.message) ?? asText(raw.error)
  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    raw,
  }
}

/**
 * 这次失败是不是网络原因（连不上 / 掉线 / 超时）。
 *
 * 用途：**决定要不要跳歌**。网络断了的时候往后跳一首同样是放不出来，
 * 结果就是把整个队列静默烧完 —— 用户看到的就是「一直在跳、什么都没响」。
 * 所以网络类失败原地停下并提示，不要跳。
 *
 * 文案依据 SwiftAudioEx 的 `AudioPlayerError.PlaybackError` 枚举
 * （`notConnectedToInternet` 等）与 Android Media3 的错误描述。
 */
export function isNetworkFailure(error: NormalizedPlaybackError): boolean {
  const haystack = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  if (!haystack.trim()) return false
  return /not ?connected|no ?network|network|offline|unreachable|timed? ?out|timeout|连接|网络|超时/.test(haystack)
}

/** 自动跳歌的滑动窗口与次数上限 */
export const AUTO_SKIP_WINDOW_MS = 30_000
export const MAX_AUTO_SKIPS_IN_WINDOW = 3

export function pruneAutoSkips(recentSkips: readonly number[], now: number): number[] {
  return recentSkips.filter((at) => now - at < AUTO_SKIP_WINDOW_MS)
}

/**
 * 窗口内是否已经跳过太多次。
 * 触发说明「连着好几首都放不出来」——继续跳只是把队列烧完，
 * 该停下来让用户看到问题，而不是假装在正常工作。
 */
export function exceedsAutoSkipBudget(recentSkips: readonly number[], now: number): boolean {
  return pruneAutoSkips(recentSkips, now).length >= MAX_AUTO_SKIPS_IN_WINDOW
}
