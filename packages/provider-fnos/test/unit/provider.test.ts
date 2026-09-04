import { describe, expect, it, vi } from 'vitest'
import { isMusicError } from '@qj/core-domain'
import type { ServerConnection } from '@qj/provider-api'
import { FnosProvider } from '../../src/provider'

const connection: ServerConnection = {
  id: 'srv-test',
  providerId: 'fnos',
  displayName: '测试 NAS',
  baseUrl: 'http://192.168.2.100:5666',
  username: 'test',
}

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = handler(String(input), init)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

function makeProvider(fetchImpl: typeof fetch, token = 'tok-123') {
  return new FnosProvider(
    connection,
    { sha256Hex: async (input) => `sha256(${input})`, deviceId: 'device-1', fetchImpl },
    { token, user: { id: 'u1', name: 'test', isAdmin: false }, deviceId: 'device-1', createdAt: 0 },
  )
}

describe('登录', () => {
  it('密码以 sha256 提交，并带上 deviceId', async () => {
    let captured: { url: string; body: unknown } | undefined
    const provider = new FnosProvider(connection, {
      sha256Hex: async () => 'hashed-password',
      deviceId: 'device-1',
      fetchImpl: fakeFetch((url, init) => {
        captured = { url, body: JSON.parse(String(init?.body)) }
        return { code: 0, msg: '', data: { userToken: 'tok-abc', user: { guid: 'u1', name: 'test', role: 'member' } } }
      }),
    })

    const session = await provider.login({ password: '示例密码-不是真实凭据' })

    expect(captured?.url).toBe('http://192.168.2.100:5666/music/api/v1/user/password-login')
    expect(captured?.body).toEqual({ username: 'test', password: 'hashed-password', deviceId: 'device-1' })
    expect(session.token).toBe('tok-abc')
    expect(session.user).toEqual({ id: 'u1', name: 'test', isAdmin: false })
  })
})

describe('分页请求', () => {
  it('按 page/size/sort 拼查询串并算出 hasMore', async () => {
    const urls: string[] = []
    const provider = makeProvider(
      fakeFetch((url) => {
        urls.push(url)
        return { code: 0, msg: '', data: { list: [{ guid: 'a1', name: '专辑', artists: [] }], total: 10, sort: 'newTrackAddedAt,desc' } }
      }),
    )

    const page = await provider.albums({ page: 1, size: 1, sort: { field: 'createdAt', order: 'desc' } })

    expect(urls[0]).toContain('/album/list?')
    expect(urls[0]).toContain('page=1')
    expect(urls[0]).toContain('size=1')
    expect(urls[0]).toContain('sort=newTrackAddedAt%2Cdesc')
    expect(page.hasMore).toBe(true)
    expect(page.items[0]?.name).toBe('专辑')
  })
})

describe('错误码翻译', () => {
  it('99999 变成 unauthorized', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 99999, msg: 'INVALID TOKEN', data: null }), 401))
    await expect(provider.currentUser()).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'unauthorized' && error.needsReauth)
  })

  it('100003 变成 forbidden', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 100003, msg: 'forbidden, admin only', data: null })))
    await expect(provider.currentUser()).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'forbidden')
  })

  it('字段结构不符时归类为 protocol，提示接口可能升级', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 0, msg: '', data: { unexpected: true } })))
    await expect(provider.currentUser()).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'protocol')
  })
})

describe('媒体地址', () => {
  it('封面地址带 coverId/size 与鉴权头', () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 0, data: null })))
    const image = provider.image('album_abc', 300)
    expect(image.url).toBe('http://192.168.2.100:5666/music/api/v1/static/cover?coverId=album_abc&size=300')
    expect(image.headers).toEqual({ authorization: 'tok-123' })
  })

  it('播放地址是可 Range 的直推地址，鉴权走请求头（飞牛不支持 query token）', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 0, data: null })))
    const stream = await provider.stream('track-1', { quality: 'original', allowTranscode: false })
    expect(stream.url).toBe('http://192.168.2.100:5666/music/api/v1/track/stream?guid=track-1')
    expect(stream.transport).toBe('progressive')
    expect(stream.headers.authorization).toBe('tok-123')
    expect(stream.url).not.toContain('token=')
  })

  it('未登录时拒绝生成播放地址', async () => {
    const provider = new FnosProvider(connection, { sha256Hex: async () => 'x', deviceId: 'd', fetchImpl: fakeFetch(() => ({})) })
    await expect(provider.stream('t', { quality: 'original', allowTranscode: false })).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'unauthorized',
    )
  })
})
