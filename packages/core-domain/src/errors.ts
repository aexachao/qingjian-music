export type MusicErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'invalidArguments'
  | 'unsupported'
  | 'network'
  | 'timeout'
  | 'canceled'
  | 'protocol'
  | 'server'

export interface MusicErrorInit {
  code: MusicErrorCode
  message: string
  /** HTTP 状态码 */
  status?: number
  /** 后端自有错误码，如飞牛的 99999 / 100002 */
  providerCode?: number | string
  cause?: unknown
}

/** 全局统一错误类型，provider 负责把各家错误翻译成它 */
export class MusicError extends Error {
  readonly code: MusicErrorCode
  readonly status?: number
  readonly providerCode?: number | string

  constructor(init: MusicErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'MusicError'
    this.code = init.code
    if (init.status !== undefined) this.status = init.status
    if (init.providerCode !== undefined) this.providerCode = init.providerCode
  }

  /** 是否值得自动重试（网络抖动 / 超时 / 5xx） */
  get retryable(): boolean {
    return this.code === 'network' || this.code === 'timeout' || this.code === 'server'
  }

  /** 是否需要把用户踢回登录页 */
  get needsReauth(): boolean {
    return this.code === 'unauthorized'
  }
}

export function isMusicError(error: unknown): error is MusicError {
  return error instanceof MusicError
}

/**
 * 判断一个异常是不是「请求被取消」。
 *
 * 不能只认 `error.name === 'AbortError'`：
 * expo 的原生 fetch 被取消时抛的是自己的 `FetchRequestCanceledException`，
 * 既不是 DOMException 也不叫 AbortError，名字只出现在 message 里
 * （`fetch failed: FetchRequestCanceledException: Fetch request has been canceled`）。
 * 认不出来的话，一次主动取消会被误判成 `network`（可重试），既掩盖了真实原因，
 * 又会让上层对着一个已经放弃的请求反复重试。
 */
function isCancellation(error: Error): boolean {
  if (error.name === 'AbortError') return true
  if (/abort|cancel/i.test(error.name)) return true
  return /request has been canceled|request aborted|the operation was aborted/i.test(error.message)
}

export function toMusicError(error: unknown, fallbackMessage = '请求失败'): MusicError {
  if (isMusicError(error)) return error
  if (error instanceof Error) {
    if (isCancellation(error)) {
      return new MusicError({ code: 'canceled', message: '请求已取消', cause: error })
    }
    return new MusicError({ code: 'network', message: error.message || fallbackMessage, cause: error })
  }
  return new MusicError({ code: 'network', message: fallbackMessage, cause: error })
}
