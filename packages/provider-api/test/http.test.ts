import { describe, expect, it, vi } from 'vitest'
import { isMusicError } from '@qj/core-domain'
import { HttpClient } from '../src/http'

function response(status: number, body: string) {
  return vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
}

describe('HttpClient 状态码映射', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [408, 'timeout'],
    [500, 'server'],
    [503, 'server'],
  ] as const)('HTTP %i 即使带 JSON 正文也映射为 %s', async (status, code) => {
    const client = new HttpClient({
      baseUrl: 'https://music.example.com/api',
      fetchImpl: response(status, JSON.stringify({ message: 'upstream failure' })),
    })

    await expect(client.getJson('/tracks')).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === code && error.status === status,
    )
  })

  it('成功状态的非法 JSON 仍归类为 protocol', async () => {
    const client = new HttpClient({ baseUrl: 'https://music.example.com/api', fetchImpl: response(200, '<html>') })
    await expect(client.getJson('/tracks')).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'protocol' && error.status === 200,
    )
  })
})

describe('HttpClient 超时与取消归因', () => {
  /** 永不主动返回、但会响应 abort 的 fetch（与真实 fetch 行为一致） */
  const hanging = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        const abort = () => reject(new DOMException('Aborted', 'AbortError'))
        if (signal.aborted) return abort()
        signal.addEventListener('abort', abort, { once: true })
      }),
  ) as unknown as typeof fetch

  it('自己触发的超时要归类为 timeout（可重试），而不是 network', async () => {
    const client = new HttpClient({ baseUrl: 'https://music.example.com/api', fetchImpl: hanging, timeoutMs: 10 })
    await expect(client.getJson('/tracks')).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'timeout' && error.retryable,
    )
  })

  it('超时判定不依赖 AbortSignal.reason', async () => {
    // 回归防线：RN / expo 的 AbortController 对 abort(reason) 支持不一致，
    // 早期实现靠 signal.reason instanceof MusicError 反查，reason 一丢超时就被
    // 降级成 code:'network'。这里用「忽略 reason、抛自己的异常」的假 fetch 复现该环境。
    const expoLike = vi.fn(async (_url: string, init?: RequestInit) => {
      await new Promise<void>((resolve) => {
        const signal = init?.signal
        if (!signal) return resolve()
        if (signal.aborted) return resolve()
        signal.addEventListener('abort', () => resolve(), { once: true })
      })
      throw new Error('fetch failed: FetchRequestCanceledException: Fetch request has been canceled')
    }) as unknown as typeof fetch

    const client = new HttpClient({ baseUrl: 'https://music.example.com/api', fetchImpl: expoLike, timeoutMs: 10 })
    await expect(client.getJson('/tracks')).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'timeout',
    )
  })

  it('调用方主动取消归类为 canceled（不可重试），别当成网络故障去重试', async () => {
    const controller = new AbortController()
    const client = new HttpClient({ baseUrl: 'https://music.example.com/api', fetchImpl: hanging })
    const pending = client.getJson('/tracks', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'canceled' && !error.retryable,
    )
  })

  it('已经取消过的 signal 不再发请求', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const controller = new AbortController()
    controller.abort()
    const client = new HttpClient({ baseUrl: 'https://music.example.com/api', fetchImpl })
    await expect(client.getJson('/tracks', { signal: controller.signal })).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'canceled',
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
