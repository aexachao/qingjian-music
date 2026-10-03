import { isMusicError, MusicError } from '@qj/core-domain'
import { HttpClient, type QueryValue, type RequestOptions } from '@qj/provider-api'
import type { z } from 'zod'
import { FNOS_API_PREFIX, FNOS_CODES } from './endpoints'
import { relayHeadersFor } from './fn-connect'
import { envelopeSchema } from './schemas'

export interface FnosClientOptions {
  /** 服务器根地址，不含 API 前缀 */
  baseUrl: string
  token?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /**
   * token 失效时用来换新 token（静默重登）。返回 undefined 表示换不到，
   * 错误会原样抛给上层，由 UI 决定是否退到登录页。
   */
  reauthorize?: () => Promise<string | undefined>
  /** GET 遇到可切线的网络错误后，协调器验证备用地址并切换时返回 true。 */
  recoverRoute?: (failedBaseUrl: string) => Promise<boolean>
  /** 同一 provider 的路线快照共享 token 与 401 刷新单飞状态。 */
  authState?: FnosAuthState
}

export interface FnosAuthState {
  token?: string
  refreshing?: Promise<string | undefined>
}

/** 认证生命周期请求不能递归触发静默重登。 */
export interface FnosRequestOptions extends RequestOptions {
  skipReauth?: boolean
  /** 对不理会 abort 的 fetch 也强制返回；只用于故障恢复预检等有明确上限的读请求。 */
  hardTimeoutMs?: number
}

/**
 * 飞牛音乐 HTTP 客户端：负责鉴权头、信封拆解与错误码翻译。
 * 鉴权用 `authorization: <token>`（裸 token，不是 Bearer），实测 query token 不被接受。
 */
export class FnosClient {
  private readonly authState: FnosAuthState
  private http: HttpClient
  private root: string
  private readonly timeoutMs: number | undefined
  private readonly fetchImpl: typeof fetch | undefined
  private readonly reauthorize: (() => Promise<string | undefined>) | undefined
  private readonly recoverRoute: ((failedBaseUrl: string) => Promise<boolean>) | undefined
  constructor(options: FnosClientOptions) {
    this.authState = options.authState ?? { token: options.token }
    this.reauthorize = options.reauthorize
    this.recoverRoute = options.recoverRoute
    this.timeoutMs = options.timeoutMs
    this.fetchImpl = options.fetchImpl
    this.root = options.baseUrl.replace(/\/+$/, '')
    this.http = this.makeHttp(this.root)
  }

  private makeHttp(root: string): HttpClient {
    /**
     * FN ID 走的是 `https://<fnid>.fnos.net` 中继。这个域名同时也是浏览器门户，
     * 不带 `Cookie: mode=relay` 时 nginx 会把**所有**请求 302 到 `https://fnos.net/<fnid>/`
     * 的 HTML 门户页 —— 登录、浏览、取流全都会拿到一张网页，前端只能翻译成
     * 「账号或密码不正确」这种和真实原因毫不相干的提示。
     *
     * 这里按 baseUrl 的域名判定，登录、浏览、取流、封面共用同一份头，
     * 不会出现「某个入口忘了带」的漏网。
     */
    const relayHeaders = relayHeadersFor(root)
    return new HttpClient({
      baseUrl: `${root}${FNOS_API_PREFIX}`,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      headers: () => {
        const headers: Record<string, string> = {}
        if (this.authState.token) headers['authorization'] = this.authState.token
        return { ...headers, ...relayHeaders }
      },
    })
  }

  setBaseUrl(baseUrl: string): void {
    this.root = baseUrl.replace(/\/+$/, '')
    this.http = this.makeHttp(this.root)
  }

  getBaseUrl(): string {
    return this.root
  }

  /** 用创建时路线固定转码会话，避免旧会话的 quit 误伤新线路上的同 guid 会话。 */
  snapshot(): FnosClient {
    return new FnosClient({
      baseUrl: this.root,
      authState: this.authState,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      ...(this.reauthorize ? { reauthorize: this.reauthorize } : {}),
    })
  }

  setToken(token: string | undefined): void {
    this.authState.token = token
  }

  hasToken(): boolean {
    return Boolean(this.authState.token)
  }

  /** 音频与封面直接给播放器 / 图片组件用，所以要能单独拿到 url 和 headers */
  resourceUrl(path: string, query?: Record<string, QueryValue>): string {
    return this.http.buildUrl(path, query)
  }

  authHeaders(): Record<string, string> {
    return this.http.authHeaders()
  }

  async get<T>(path: string, schema: z.ZodType<T>, options: FnosRequestOptions = {}): Promise<T> {
    const { skipReauth, hardTimeoutMs, ...requestOptions } = options
    // 请求开始时所在的线路不能在 await 后从 this.root 反推：别的并发请求可能已
    // 切线，晚到的旧线路错误必须被识别为旧错误而不是触发一次反向切换。
    let attemptedBaseUrl = this.root
    const run = () => {
      attemptedBaseUrl = this.root
      const request = this.http.getJson(path, requestOptions)
      return hardTimeoutMs === undefined ? request : this.withDeadline(request, hardTimeoutMs)
    }
    try {
      return await this.withReauth(path, schema, run, !skipReauth)
    } catch (error) {
      // 切歌或页面卸载导致的取消不是网络故障；即使 HTTP 层刚好给出了 5xx，
      // 也不能再去探测备用线路，更不能在切线后重放这个已放弃的 GET。
      if (requestOptions.signal?.aborted) throw error
      if (!this.recoverRoute || !isRouteFailure(error)) throw error
      if (!await this.recoverRoute(attemptedBaseUrl) || requestOptions.signal?.aborted) throw error
      return this.withReauth(path, schema, run, !skipReauth)
    }
  }

  async post<T>(path: string, body: unknown, schema: z.ZodType<T>, options: FnosRequestOptions = {}): Promise<T> {
    const { skipReauth, hardTimeoutMs: _hardTimeoutMs, ...requestOptions } = options
    return this.withReauth(path, schema, () => this.http.postJson(path, body, requestOptions), !skipReauth)
  }

  /** 请求一次；若因 token 失效被拒，静默重登后再试一次 */
  private async withReauth<T>(
    path: string,
    schema: z.ZodType<T>,
    run: () => Promise<unknown>,
    allowReauth = true,
  ): Promise<T> {
    try {
      return this.unwrap(await run(), schema, path)
    } catch (error) {
      const expired = isMusicError(error) && error.code === 'unauthorized'
      // 重登过程中自身的请求（login）不再触发重登，避免递归
      if (!allowReauth || !expired || !this.reauthorize) throw error
      const token = await this.refreshToken()
      if (!token) throw error
      // snapshot client（转码会话固定线路）也要更新自己的 token；provider 的
      // restoreSession 只会更新主 client，直接重试快照会继续带旧 token。
      this.setToken(token)
      return this.unwrap(await run(), schema, path)
    }
  }

  private withDeadline<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        callback()
      }
      const timer = setTimeout(() => finish(() => reject(new MusicError({ code: 'timeout', message: `请求超时（${timeoutMs}ms）` }))), timeoutMs)
      void request.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      )
    })
  }

  private async refreshToken(): Promise<string | undefined> {
    if (!this.reauthorize) return undefined
    if (this.authState.refreshing) return this.authState.refreshing
    const refresh = this.reauthorize()
    this.authState.refreshing = refresh
    try {
      return await refresh
    } catch {
      return undefined
    } finally {
      if (this.authState.refreshing === refresh) this.authState.refreshing = undefined
    }
  }

  private unwrap<T>(payload: unknown, schema: z.ZodType<T>, path: string): T {
    const envelope = envelopeSchema.safeParse(payload)
    if (!envelope.success) {
      throw new MusicError({ code: 'protocol', message: `${path} 返回结构无法识别`, cause: envelope.error })
    }
    const { code, msg, data } = envelope.data
    if (code !== FNOS_CODES.ok) {
      throw translateCode(code, msg ?? '', path)
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      throw new MusicError({
        code: 'protocol',
        message: `${path} 返回字段与预期不符（接口可能已升级）`,
        providerCode: code,
        cause: parsed.error,
      })
    }
    return parsed.data
  }
}

function isRouteFailure(error: unknown): boolean {
  if (!isMusicError(error)) return false
  if (error.code === 'network' || error.code === 'timeout') return true
  return error.code === 'server' && (error.status === 502 || error.status === 503 || error.status === 504)
}

export function translateCode(code: number, msg: string, path: string): MusicError {
  switch (code) {
    case FNOS_CODES.invalidToken:
      return new MusicError({ code: 'unauthorized', message: '登录已失效，请重新登录', status: 401, providerCode: code })
    case FNOS_CODES.forbiddenAdminOnly:
      return new MusicError({ code: 'forbidden', message: '该操作需要管理员权限', providerCode: code })
    case FNOS_CODES.invalidArguments:
      return new MusicError({ code: 'invalidArguments', message: `${path} 参数不正确`, providerCode: code })
    case FNOS_CODES.notFound:
      return new MusicError({ code: 'notFound', message: '资源不存在', providerCode: code })
    // 歌单的 160001/160002 若不单独翻译会落到 default 变成 code:'server'，
    // 而 'server' 被 MusicError.retryable 判为可重试 —— 重名重试多少次都不会成功。
    case FNOS_CODES.playlistNameExists:
      return new MusicError({ code: 'invalidArguments', message: '歌单名称已存在', providerCode: code })
    case FNOS_CODES.playlistHitMaxCount:
      return new MusicError({ code: 'invalidArguments', message: '歌单数量已达上限', providerCode: code })
    case FNOS_CODES.unknownError:
      return new MusicError({ code: 'protocol', message: msg || `${path} 请求体结构不正确`, providerCode: code })
    default:
      return new MusicError({ code: 'server', message: msg || `${path} 返回错误码 ${code}`, providerCode: code })
  }
}
