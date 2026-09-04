import { isMusicError, MusicError } from '@qj/core-domain'
import { HttpClient, type QueryValue, type RequestOptions } from '@qj/provider-api'
import type { z } from 'zod'
import { FNOS_API_PREFIX, FNOS_CODES } from './endpoints'
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
}

/**
 * 飞牛音乐 HTTP 客户端：负责鉴权头、信封拆解与错误码翻译。
 * 鉴权用 `authorization: <token>`（裸 token，不是 Bearer），实测 query token 不被接受。
 */
export class FnosClient {
  private token: string | undefined
  private readonly http: HttpClient
  private readonly reauthorize: (() => Promise<string | undefined>) | undefined
  /** 单飞：并发请求同时 401 时只重登一次 */
  private refreshing: Promise<string | undefined> | null = null

  constructor(options: FnosClientOptions) {
    this.token = options.token
    this.reauthorize = options.reauthorize
    this.http = new HttpClient({
      baseUrl: `${options.baseUrl.replace(/\/+$/, '')}${FNOS_API_PREFIX}`,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
      headers: () => {
        const headers: Record<string, string> = {}
        if (this.token) headers['authorization'] = this.token
        return headers
      },
    })
  }

  setToken(token: string | undefined): void {
    this.token = token
  }

  hasToken(): boolean {
    return Boolean(this.token)
  }

  /** 音频与封面直接给播放器 / 图片组件用，所以要能单独拿到 url 和 headers */
  resourceUrl(path: string, query?: Record<string, QueryValue>): string {
    return this.http.buildUrl(path, query)
  }

  authHeaders(): Record<string, string> {
    return this.http.authHeaders()
  }

  async get<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
    return this.withReauth(path, schema, () => this.http.getJson(path, options))
  }

  async post<T>(path: string, body: unknown, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
    return this.withReauth(path, schema, () => this.http.postJson(path, body, options))
  }

  /** 请求一次；若因 token 失效被拒，静默重登后再试一次 */
  private async withReauth<T>(path: string, schema: z.ZodType<T>, run: () => Promise<unknown>): Promise<T> {
    try {
      return this.unwrap(await run(), schema, path)
    } catch (error) {
      const expired = isMusicError(error) && error.code === 'unauthorized'
      // 重登过程中自身的请求（login）不再触发重登，避免递归
      if (!expired || !this.reauthorize || this.refreshing) throw error
      const token = await this.refreshToken()
      if (!token) throw error
      return this.unwrap(await run(), schema, path)
    }
  }

  private async refreshToken(): Promise<string | undefined> {
    if (!this.reauthorize) return undefined
    this.refreshing = this.reauthorize()
    try {
      return await this.refreshing
    } catch {
      return undefined
    } finally {
      this.refreshing = null
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
    case FNOS_CODES.unknownError:
      return new MusicError({ code: 'protocol', message: msg || `${path} 请求体结构不正确`, providerCode: code })
    default:
      return new MusicError({ code: 'server', message: msg || `${path} 返回错误码 ${code}`, providerCode: code })
  }
}
