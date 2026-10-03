import { describe, expect, it, vi } from 'vitest'
import { isMusicError } from '@qj/core-domain'
import type { ProviderSession, ServerConnection } from '@qj/provider-api'
import { mapTrack } from '../../src/mappers'
import { FnosProvider } from '../../src/provider'

const connection: ServerConnection = {
  id: 'srv-test',
  providerId: 'fnos',
  displayName: '测试 NAS',
  baseUrl: 'http://192.168.2.100:5666',
  username: 'test',
}

const staleSession: ProviderSession = {
  token: 'tok-stale',
  user: { id: 'u1', name: 'test', isAdmin: false },
  deviceId: 'device-1',
  createdAt: 0,
}

const trackPayload = {
  guid: 't1',
  title: '心植桂冠',
  duration: 152030,
  isFavorite: true,
  artists: [{ guid: 'a1', name: '何真真' }],
}

/**
 * 模拟飞牛：带旧 token 的请求返回 99999（token 失效），
 * 重登后换到的新 token 才放行。
 */
function makeStaleThenFreshFetch() {
  const calls: string[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const token = (init?.headers as Record<string, string> | undefined)?.['authorization']
    calls.push(`${url.replace('http://192.168.2.100:5666/music/api/v1', '')} token=${token ?? '-'}`)

    let body: unknown
    if (url.includes('/user/password-login')) {
      body = { code: 0, msg: '', data: { userToken: 'tok-fresh', user: { guid: 'u1', name: 'test', role: 'member' } } }
    } else if (token === 'tok-fresh') {
      body = { code: 0, msg: '', data: { list: [trackPayload], total: 1 } }
    } else {
      body = { code: 99999, msg: 'invalid token', data: null }
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch

  return { fetchImpl, calls }
}

describe('token 失效后的静默重登', () => {
  it('登录请求本身失败时不递归触发静默重登', async () => {
    let recoverCalls = 0
    let loginCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/user/password-login')) loginCalls += 1
      return new Response(JSON.stringify({ code: 99999, msg: 'invalid credentials', data: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch
    const provider = new FnosProvider(connection, {
      sha256Hex: async () => 'hashed',
      deviceId: 'device-1',
      fetchImpl,
      recoverPassword: async () => {
        recoverCalls += 1
        return '示例密码-不是真实凭据'
      },
    })

    await expect(provider.login({ password: 'bad' })).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'unauthorized',
    )
    expect(loginCalls).toBe(1)
    expect(recoverCalls).toBe(0)
  })

  it('服务端 logout 401 不触发静默重登', async () => {
    let recoverCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/user/logout')) {
        return new Response('unauthorized', { status: 401 })
      }
      return new Response(JSON.stringify({ code: 0, msg: '', data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch
    const provider = new FnosProvider(connection, {
      sha256Hex: async () => 'hashed',
      deviceId: 'device-1',
      fetchImpl,
      recoverPassword: async () => {
        recoverCalls += 1
        return '示例密码-不是真实凭据'
      },
    }, staleSession)

    await expect(provider.logout()).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'unauthorized',
    )
    expect(recoverCalls).toBe(0)
  })

  it('拿 Keychain 密码换新 token，并把原请求重试成功', async () => {
    const { fetchImpl, calls } = makeStaleThenFreshFetch()
    const refreshed: ProviderSession[] = []
    const provider = new FnosProvider(
      connection,
      {
        sha256Hex: async (input) => `sha256(${input})`,
        deviceId: 'device-1',
        fetchImpl,
        recoverPassword: async () => '示例密码-不是真实凭据',
        onSessionRefreshed: (_connection, session) => {
          refreshed.push(session)
        },
      },
      staleSession,
    )

    const page = await provider.tracks({ page: 1, size: 50 })

    expect(page.items[0]?.title).toBe('心植桂冠')
    expect(refreshed).toHaveLength(1)
    expect(refreshed[0]?.token).toBe('tok-fresh')
    // 三次请求：失败的原请求 → 重登 → 带新 token 重试
    expect(calls).toEqual([
      '/track/list?page=1&size=50 token=tok-stale',
      '/user/password-login token=tok-stale',
      '/track/list?page=1&size=50 token=tok-fresh',
    ])
  })

  it('多个并发 401 共用一次重登，随后全部用新 token 重试', async () => {
    let loginCalls = 0
    let freshToken = false
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const token = (init?.headers as Record<string, string> | undefined)?.authorization
      if (url.includes('/user/password-login')) {
        loginCalls += 1
        await Promise.resolve()
        freshToken = true
        return new Response(
          JSON.stringify({
            code: 0,
            msg: '',
            data: { userToken: 'tok-fresh', user: { guid: 'u1', name: 'test', role: 'member' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      const body = token === 'tok-fresh' && freshToken
        ? { code: 0, msg: '', data: { list: [trackPayload], total: 1 } }
        : { code: 99999, msg: 'invalid token', data: null }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const provider = new FnosProvider(
      connection,
      {
        sha256Hex: async (input) => `sha256(${input})`,
        deviceId: 'device-1',
        fetchImpl,
        recoverPassword: async () => '示例密码-不是真实凭据',
      },
      staleSession,
    )

    const [first, second] = await Promise.all([
      provider.tracks({ page: 1, size: 50 }),
      provider.tracks({ page: 2, size: 50 }),
    ])

    expect(first.items[0]?.title).toBe('心植桂冠')
    expect(second.items[0]?.title).toBe('心植桂冠')
    expect(loginCalls).toBe(1)
  })

  it('宿主没提供密码时不重登，直接抛 unauthorized', async () => {
    const { fetchImpl, calls } = makeStaleThenFreshFetch()
    const provider = new FnosProvider(
      connection,
      { sha256Hex: async () => 'hashed', deviceId: 'device-1', fetchImpl },
      staleSession,
    )

    await expect(provider.tracks({ page: 1, size: 50 })).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'unauthorized',
    )
    expect(calls).toHaveLength(1)
  })

  it('取不到密码时保持原始错误，不做无意义重试', async () => {
    const { fetchImpl, calls } = makeStaleThenFreshFetch()
    const provider = new FnosProvider(
      connection,
      {
        sha256Hex: async () => 'hashed',
        deviceId: 'device-1',
        fetchImpl,
        recoverPassword: async () => undefined,
      },
      staleSession,
    )

    await expect(provider.tracks({ page: 1, size: 50 })).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'unauthorized',
    )
    expect(calls).toHaveLength(1)
  })
})

describe('收藏标记映射', () => {
  it('isFavorite 原样带进领域模型', () => {
    expect(mapTrack({ ...trackPayload, isFavorite: true }).isFavorite).toBe(true)
    expect(mapTrack({ ...trackPayload, isFavorite: false }).isFavorite).toBe(false)
    // 后端不返回该字段时保持 undefined，UI 据此隐藏收藏按钮
    expect(mapTrack({ guid: 't2', title: '无收藏字段' }).isFavorite).toBeUndefined()
  })
})

it('logout invalidates an in-flight refresh and prevents later reauthorization', async () => {
  let finishLogin!: (response: Response) => void
  let enteredLogin!: () => void
  const loginStarted = new Promise<void>((resolve) => { enteredLogin = resolve })
  const refreshed = vi.fn()
  const recover = vi.fn(async () => 'test-password')
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/user/password-login')) {
      enteredLogin()
      return new Promise<Response>((resolve) => { finishLogin = resolve })
    }
    return new Response(JSON.stringify(url.includes('/user/logout')
      ? { code: 0, data: {} }
      : { code: 99999, msg: 'invalid token', data: null }), { status: 200 })
  }) as unknown as typeof fetch
  const provider = new FnosProvider(connection, { sha256Hex: async () => 'hash', deviceId: 'device', fetchImpl, recoverPassword: recover, onSessionRefreshed: refreshed }, staleSession)
  const pending = provider.albums({ page: 1, size: 10 }).catch((error: unknown) => error)
  await loginStarted
  await provider.logout()
  finishLogin(new Response(JSON.stringify({code:0,data:{userToken:'fresh',user:{guid:'u1',name:'test',role:'member'}}}),{status:200}))
  expect(isMusicError(await pending)).toBe(true)
  expect(refreshed).not.toHaveBeenCalled()
  await expect(provider.albums({page:1,size:10})).rejects.toSatisfy(isMusicError)
  expect(recover).toHaveBeenCalledTimes(1)
})

it('logout while persisting a refreshed session cannot restore the old client token', async () => {
  let release!: () => void
  let entered!: () => void
  const enteredPersistence = new Promise<void>((resolve) => { entered = resolve })
  const persistence = new Promise<void>((resolve) => { release = resolve })
  const tokens: (string | undefined)[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/user/password-login')) {
      return new Response(JSON.stringify({ code: 0, data: { userToken: 'fresh', user: { guid: 'u1', name: 'test', role: 'member' } } }), { status: 200 })
    }
    if (url.includes('/user/logout')) return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 })
    tokens.push((init?.headers as Record<string, string> | undefined)?.authorization)
    return new Response(JSON.stringify({ code: 99999, msg: 'invalid token', data: null }), { status: 200 })
  }) as typeof fetch
  const provider = new FnosProvider(connection, {
    sha256Hex: async () => 'hash', deviceId: 'device', fetchImpl,
    recoverPassword: async () => 'test-password',
    onSessionRefreshed: async () => { entered(); await persistence },
  }, staleSession)
  const pending = provider.albums({ page: 1, size: 10 }).catch((error: unknown) => error)
  await enteredPersistence
  await provider.logout()
  release()
  expect(isMusicError(await pending)).toBe(true)
  await expect(provider.albums({ page: 1, size: 10 })).rejects.toSatisfy(isMusicError)
  expect(tokens).toEqual([staleSession.token, undefined])
})
