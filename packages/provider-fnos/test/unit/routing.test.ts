import { describe, expect, it, vi } from 'vitest'
import { isMusicError } from '@qj/core-domain'
import type { ProviderSession, ServerConnection } from '@qj/provider-api'
import { z } from 'zod'
import { FnosClient } from '../../src/client'
import { FnosProvider } from '../../src/provider'
import { FnosRouteCoordinator } from '../../src/routing'

const primary = 'http://192.168.2.100:5666'
const alternate = 'http://192.168.2.101:5666'
const connection: ServerConnection = {
  id: 'srv-routing', providerId: 'fnos', displayName: '多线路 NAS', baseUrl: primary,
  alternateBaseUrls: [alternate], username: 'test',
}
const session: ProviderSession = {
  token: 'tok-123', user: { id: 'u1', name: 'test', isAdmin: false }, deviceId: 'device-1', createdAt: 0,
}
const user = { code: 0, data: { guid: 'u1', name: 'test', role: 'member' } }

function provider(fetchImpl: typeof fetch) {
  return new FnosProvider(connection, { sha256Hex: async () => 'hash', deviceId: 'device-1', fetchImpl }, session)
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('fnOS 多线路故障切换', () => {
  it('同域名时优先匹配最长 base path，媒体 URL 不会被根路径线路吞掉', async () => {
    const root = 'https://music.example.com'
    const subpath = 'https://music.example.com/alternate'
    let active = root
    const router = new FnosRouteCoordinator({
      baseUrl: root,
      alternateBaseUrls: [subpath],
      session: () => session,
      probe: async () => session.user,
      activeChanged: (baseUrl) => { active = baseUrl },
    })
    await router.recover(root)
    expect(active).toBe(subpath)
    await router.recover(`${subpath}/music/api/v1/track/stream?guid=t1`)
    expect(active).toBe(root)
  })

  it('GET 的 503 探测同一用户后切到备用线路并重试一次', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      return url.startsWith(primary) ? response({}, 503) : response(user)
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    const changes = vi.fn()
    instance.routing?.subscribe(changes)

    await expect(instance.currentUser()).resolves.toMatchObject({ id: 'u1' })
    expect(instance.routing?.getActiveBaseUrl()).toBe(alternate)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(calls.filter((url) => url.startsWith(alternate))).toHaveLength(2) // probe + original GET retry
  })

  it('全部备用线路失败时保持原线路', async () => {
    const fetchImpl = vi.fn(async () => response({}, 503)) as unknown as typeof fetch
    const instance = new FnosProvider(connection, {
      sha256Hex: async () => 'hash', deviceId: 'device-1', fetchImpl,
      recoverPassword: async () => 'password',
    }, session)
    await expect(instance.currentUser()).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.status === 503)
    expect(instance.routing?.getActiveBaseUrl()).toBe(primary)
  })

  it('并发故障共用一次备用线路探测', async () => {
    let alternateCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith(primary)) return response({}, 503)
      alternateCalls += 1
      return response(user)
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    await expect(Promise.all([instance.currentUser(), instance.currentUser()])).resolves.toHaveLength(2)
    expect(alternateCalls).toBe(3) // one probe + two original GET retries
  })

  it('401 和 POST 都不触发切线或自动重放', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      return url.includes('/user/me') ? response({ code: 99999, data: null }) : response({}, 503)
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    await expect(instance.currentUser()).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'unauthorized')
    await expect(instance.setFavorite('t1', true)).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.status === 503)
    expect(calls.every((url) => url.startsWith(primary))).toBe(true)
    expect(calls.filter((url) => url.includes('/favorite-track')).length).toBe(1)
  })

  it('备用线路以现有 token 验证同一用户，非法地址和不同用户不接受', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return response(url.startsWith(alternate) ? { code: 0, data: { guid: 'other', name: 'other', role: 'member' } } : user)
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    await expect(instance.routing?.validate(alternate)).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'forbidden')
    expect(() => instance.routing?.setAlternates(['https://example.com?x=1'])).toThrow()
  })

  it('切线后资源地址和中继头都随 active host 更新，旧 URL 的 recover 不再重复切线', async () => {
    const relay = 'https://relay1.fnos.net'
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => String(input).startsWith(primary) ? response({}, 503) : response(user)) as unknown as typeof fetch
    const instance = new FnosProvider({ ...connection, alternateBaseUrls: [relay] }, {
      sha256Hex: async () => 'hash', deviceId: 'device-1', fetchImpl,
    }, session)
    await instance.currentUser()
    const image = instance.image('cover-1')
    expect(image.url).toMatch(new RegExp(`^${relay}/music/api/v1/`))
    expect(image.headers.Cookie).toBe('mode=relay')
    await expect(instance.routing?.recover(`${primary}/music/api/v1/track/stream?guid=t1`)).resolves.toBe(true)
    instance.routing?.setAlternates([])
    expect(instance.routing?.getActiveBaseUrl()).toBe(primary)
  })

  it('旧线路的晚到失败不会把已经切好的 active 线路反向切回去', async () => {
    let primaryRequests = 0
    let releaseLateFailure!: () => void
    const lateFailure = new Promise<Response>((resolve) => { releaseLateFailure = () => resolve(response({}, 503)) })
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.startsWith(primary)) return Promise.resolve(response(user))
      primaryRequests += 1
      return primaryRequests === 1 ? Promise.resolve(response({}, 503)) : lateFailure
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    const first = instance.currentUser()
    const late = instance.currentUser()
    await first
    releaseLateFailure()
    await expect(late).resolves.toMatchObject({ id: 'u1' })
    expect(instance.routing?.getActiveBaseUrl()).toBe(alternate)
    expect(primaryRequests).toBe(2)
  })

  it('转码会话固定创建时线路；切线不改变 HLS 地址或旧会话的 quit 目标', async () => {
    const calls: string[] = []
    let releaseStart!: () => void
    let startBegan!: () => void
    const started = new Promise<void>((resolve) => { startBegan = resolve })
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      if (url.startsWith(alternate)) return Promise.resolve(response(user))
      if (url.includes('/user/me')) return Promise.resolve(response({}, 503))
      if (url.includes('/track/transcode') && !url.includes('/quit')) {
        startBegan()
        return new Promise<Response>((resolve) => { releaseStart = () => resolve(response({ code: 0, data: { status: 'ready' } })) })
      }
      return Promise.resolve(response({ code: 0, data: { status: 'success' } }))
    }) as unknown as typeof fetch
    const instance = new FnosProvider({ ...connection, alternateBaseUrls: undefined }, {
      sha256Hex: async () => 'hash', deviceId: 'device-1', fetchImpl,
    }, session)
    const streamPromise = instance.stream('t1', { quality: 'medium', allowTranscode: true })
    await started
    releaseStart()
    const stream = await streamPromise
    expect(stream.url).toMatch(new RegExp(`^${primary}/music/api/v1/track/hls/`))
    await stream.session?.close()
    expect(calls.at(-1)).toMatch(new RegExp(`^${primary}/music/api/v1/track/transcode/quit$`))
  })

  it('配置备用线路时先用 GET 预检，主线路不可用不会向它发转码 POST', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      if (url.startsWith(primary)) return response({}, 503)
      if (url.includes('/user/me')) return response(user)
      return response({ code: 0, data: { status: 'ready' } })
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    const stream = await instance.stream('preflight-track', { quality: 'medium', allowTranscode: true })
    expect(stream.url).toMatch(new RegExp(`^${alternate}/music/api/v1/track/hls/`))
    expect(calls.filter((url) => url.includes('/track/transcode') && !url.includes('/quit'))).toEqual([
      `${alternate}/music/api/v1/track/transcode`,
    ])
  })

  it('同曲目新转码接管后，旧 session 的 heartbeat 和 close 都不会碰新任务', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      if (url.includes('/user/me')) return response(user)
      return response({ code: 0, data: { status: url.includes('/track/transcode') && !url.includes('/quit') && !url.includes('/heartbeat') ? 'ready' : 'success' } })
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    const oldStream = await instance.stream('same-track', { quality: 'medium', allowTranscode: true })
    const newStream = await instance.stream('same-track', { quality: 'medium', allowTranscode: true })
    const beforeOldSessionCalls = calls.length
    await oldStream.session?.heartbeat(1_000)
    await oldStream.session?.close()
    expect(calls).toHaveLength(beforeOldSessionCalls)
    await newStream.session?.close()
    expect(calls.filter((url) => url.includes('/track/transcode/quit'))).toHaveLength(2) // new start cleans old + active close
  })

  it('旧转码 POST 晚到时先清理自己，再让同曲目的新创建开始', async () => {
    const calls: string[] = []
    let releaseOldStart!: () => void
    let oldStartBegan!: () => void
    const oldStartBeganPromise = new Promise<void>((resolve) => { oldStartBegan = resolve })
    let starts = 0
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      if (url.includes('/user/me')) return Promise.resolve(response(user))
      if (url.includes('/track/transcode') && !url.includes('/quit') && !url.includes('/heartbeat')) {
        starts += 1
        if (starts === 1) {
          oldStartBegan()
          return new Promise<Response>((resolve) => { releaseOldStart = () => resolve(response({ code: 0, data: { status: 'ready' } })) })
        }
      }
      return Promise.resolve(response({ code: 0, data: { status: 'ready' } }))
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    const oldStart = instance.stream('same-track', { quality: 'medium', allowTranscode: true })
    const oldAssertion = expect(oldStart).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'canceled')
    await oldStartBeganPromise
    const newStart = instance.stream('same-track', { quality: 'medium', allowTranscode: true })
    releaseOldStart()
    await oldAssertion
    await expect(newStart).resolves.toMatchObject({ transport: 'hls' })
    expect(calls.filter((url) => url.includes('/track/transcode/quit'))).toHaveLength(1)
  })

  it('转码快照与主请求共用一次 401 刷新，并用新 token 生成后续请求头', async () => {
    const tokens: string[] = []
    let loginCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const token = String((init?.headers as Record<string, string> | undefined)?.authorization ?? '')
      tokens.push(`${url} ${token}`)
      if (url.includes('/user/password-login')) {
        loginCalls += 1
        return response({ code: 0, data: { userToken: 'tok-fresh', user: { guid: 'u1', name: 'test', role: 'member' } } })
      }
      if (token !== 'tok-fresh') return response({ code: 99999, data: null })
      if (url.includes('/track/transcode') && !url.includes('/quit') && !url.includes('/heartbeat')) return response({ code: 0, data: { status: 'ready' } })
      if (url.includes('/user/me')) return response(user)
      return response({ code: 0, data: { status: 'success' } })
    }) as unknown as typeof fetch
    const instance = new FnosProvider(connection, {
      sha256Hex: async () => 'hash', deviceId: 'device-1', fetchImpl,
      recoverPassword: async () => 'password',
    }, session)
    const [, stream] = await Promise.all([
      instance.currentUser(),
      instance.stream('refresh-track', { quality: 'medium', allowTranscode: true }),
    ])
    expect(loginCalls).toBe(1)
    expect(stream.headers.authorization).toBe('tok-fresh')
    expect(stream.url).toMatch(new RegExp(`^${primary}/music/api/v1/track/hls/`))
    await stream.session?.heartbeat(1_000)
    await stream.session?.close()
    expect(tokens.filter((entry) => /heartbeat|quit/.test(entry))).toEqual(expect.arrayContaining([
      expect.stringContaining('tok-fresh'),
    ]))
  })

  it('注销会使进行中的探测失效，不会迟到切线', async () => {
    let finishProbe!: () => void
    let beganProbe!: () => void
    const probeWait = new Promise<void>((resolve) => { finishProbe = resolve })
    const probeBegan = new Promise<void>((resolve) => { beganProbe = resolve })
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/user/logout')) return response({ code: 0, data: {} })
      if (url.startsWith(primary)) return response({}, 503)
      beganProbe()
      await probeWait
      return response(user)
    }) as unknown as typeof fetch
    const instance = provider(fetchImpl)
    const request = instance.currentUser()
    const assertion = expect(request).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.status === 503)
    await probeBegan
    const logout = instance.logout()
    finishProbe()
    await logout
    await assertion
    expect(instance.routing?.getActiveBaseUrl()).toBe(primary)
  })

  it('备用线路的 fetch 忽略 abort 时，三秒 deadline 仍会结束恢复', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((input: RequestInfo | URL) => {
        if (String(input).startsWith(primary)) return Promise.resolve(response({}, 503))
        return new Promise<Response>(() => {})
      }) as unknown as typeof fetch
      const instance = provider(fetchImpl)
      const request = instance.currentUser()
      const assertion = expect(request).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.status === 503)
      await vi.advanceTimersByTimeAsync(3_001)
      await assertion
      expect(instance.routing?.getActiveBaseUrl()).toBe(primary)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('GET failover respects caller cancellation', () => {
  it('原请求已被取消时不探测备用线路', async () => {
    const controller = new AbortController()
    const recoverRoute = vi.fn(async () => true)
    const client = new FnosClient({
      baseUrl: primary,
      recoverRoute,
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => { controller.abort(); return '' },
      }) as Response) as unknown as typeof fetch,
    })
    await expect(client.get('/test', z.unknown(), { signal: controller.signal })).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'canceled',
    )
    expect(recoverRoute).not.toHaveBeenCalled()
  })

  it('切换探测期间取消时不重放原 GET', async () => {
    const controller = new AbortController()
    let releaseRecovery!: () => void
    let beganRecovery!: () => void
    const recoveryBegan = new Promise<void>((resolve) => { beganRecovery = resolve })
    const recovery = new Promise<boolean>((resolve) => { releaseRecovery = () => resolve(true) })
    const recoverRoute = vi.fn(() => { beganRecovery(); return recovery })
    const fetchImpl = vi.fn(async () => response({}, 503)) as unknown as typeof fetch
    const client = new FnosClient({ baseUrl: primary, recoverRoute, fetchImpl })
    const request = client.get('/test', z.unknown(), { signal: controller.signal })
    await recoveryBegan
    controller.abort()
    releaseRecovery()
    await expect(request).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.status === 503)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
