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

export function toMusicError(error: unknown, fallbackMessage = '请求失败'): MusicError {
  if (isMusicError(error)) return error
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new MusicError({ code: 'canceled', message: '请求已取消', cause: error })
    }
    return new MusicError({ code: 'network', message: error.message || fallbackMessage, cause: error })
  }
  return new MusicError({ code: 'network', message: fallbackMessage, cause: error })
}
