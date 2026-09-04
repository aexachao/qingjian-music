import { MusicError, toMusicError } from '@qj/core-domain'

export type QueryValue = string | number | boolean | undefined | null

export interface HttpClientOptions {
  /** 已含 API 前缀的根地址，例如 http://host:5666/music/api/v1 */
  baseUrl: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** 每次请求动态取头（token 变化时不用重建 client） */
  headers?: () => Record<string, string>
}

export interface RequestOptions {
  query?: Record<string, QueryValue>
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
}

const DEFAULT_TIMEOUT_MS = 15_000

export class HttpClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly headersFactory: () => Record<string, string>

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.headersFactory = options.headers ?? (() => ({}))
  }

  buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
    return url.toString()
  }

  authHeaders(): Record<string, string> {
    return this.headersFactory()
  }

  async requestJson(path: string, init: RequestInit & RequestOptions = {}): Promise<unknown> {
    const { query, timeoutMs, headers, signal, ...rest } = init
    const url = this.buildUrl(path, query)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new MusicError({ code: 'timeout', message: '请求超时' })), timeoutMs ?? this.timeoutMs)
    const onOuterAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onOuterAbort, { once: true })
    try {
      const response = await this.fetchImpl(url, {
        ...rest,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...this.headersFactory(),
          ...headers,
        },
      })
      const text = await response.text()
      if (!response.ok && !text) {
        throw new MusicError({ code: response.status >= 500 ? 'server' : 'protocol', message: `HTTP ${response.status}`, status: response.status })
      }
      if (!text) return undefined
      try {
        return JSON.parse(text) as unknown
      } catch (cause) {
        throw new MusicError({ code: 'protocol', message: '响应不是合法 JSON', status: response.status, cause })
      }
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason instanceof MusicError) {
        throw controller.signal.reason
      }
      throw toMusicError(error)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
  }

  getJson(path: string, options: RequestOptions = {}): Promise<unknown> {
    return this.requestJson(path, { ...options, method: 'GET' })
  }

  postJson(path: string, body?: unknown, options: RequestOptions = {}): Promise<unknown> {
    return this.requestJson(path, {
      ...options,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }
}
