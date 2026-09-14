import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ServerConnection } from '@qj/provider-api'
import { FnosClient } from '../../src/client'
import {
  isOfficialRelayHostname,
  probeUrl,
  relayHeadersFor,
  resolveFnIdToBaseUrl,
} from '../../src/fn-connect'
import { FnosProvider } from '../../src/provider'

const sha256Hex = async (text: string) => crypto.createHash('sha256').update(text).digest('hex')
const md5Hex = async (text: string) => crypto.createHash('md5').update(text).digest('hex')

/**
 * FN ID 走的是 `https://<fnid>.fnos.net` 中继，而这个域名同时也是浏览器门户：
 * 不带 `Cookie: mode=relay` 时 nginx 会把**所有**请求 302 到门户页，接口一个都调不通。
 *
 * 真实事故形态：本地直连（IP）一直好用，FN ID 一填就报「账号或密码不正确」——
 * 因为拿到的是门户页 HTML，被翻译成了凭据错误。这组测试把「必须带中继标记」钉住。
 */
describe('FN Connect 中继标记', () => {
  it('只有官方中继域名算中继', () => {
    for (const host of ['fnos.net', 'chrisli.fnos.net', 'CHRISLI.FNOS.NET']) {
      expect(isOfficialRelayHostname(host)).toBe(true)
    }
    for (const host of ['192.168.2.100', 'nas.local', 'fnos.net.evil.com', 'notfnos.net']) {
      expect(isOfficialRelayHostname(host)).toBe(false)
    }
  })

  it('中继地址补 Cookie: mode=relay，局域网地址不补', () => {
    expect(relayHeadersFor('https://chrisli.fnos.net')).toEqual({ Cookie: 'mode=relay' })
    expect(relayHeadersFor('http://192.168.2.100:5666')).toEqual({})
    expect(relayHeadersFor('https://music.example.com')).toEqual({})
    // 畸形地址不能让整个请求挂掉
    expect(relayHeadersFor('not-a-url')).toEqual({})
  })

  it('客户端对中继地址的每个请求都带中继标记（登录、浏览、取流共用同一份头）', async () => {
    const calls: Record<string, string>[] = []
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string>)
      return new Response(JSON.stringify({ code: 0, msg: '', data: {} }), { status: 200 })
    }) as unknown as typeof fetch

    const client = new FnosClient({ baseUrl: 'https://chrisli.fnos.net', fetchImpl })
    await client.post('/user/password-login', {}, { safeParse: () => ({ success: true, data: {} }) } as never)

    expect(calls[0]?.Cookie).toBe('mode=relay')
    // 取流/封面走的是 authHeaders()，不能只有 JSON 请求带标记
    expect(client.authHeaders().Cookie).toBe('mode=relay')
  })

  it('局域网客户端不带中继标记 —— 别给局域网请求塞无关的 Cookie', async () => {
    const calls: Record<string, string>[] = []
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string>)
      return new Response(JSON.stringify({ code: 0, msg: '', data: {} }), { status: 200 })
    }) as unknown as typeof fetch

    const client = new FnosClient({ baseUrl: 'http://192.168.2.100:5666', fetchImpl })
    await client.post('/user/password-login', {}, { safeParse: () => ({ success: true, data: {} }) } as never)

    expect(calls[0]?.Cookie).toBeUndefined()
    expect(client.authHeaders().Cookie).toBeUndefined()
  })

  it('探测中继地址时也带标记 —— 否则正确的穿透地址会被判成不可达', async () => {
    // 真实中继的行为：没有中继标记就 302 到门户页
    const gateway = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const cookie = (init?.headers as Record<string, string> | undefined)?.Cookie
      if (String(input).startsWith('https://relay.fnos.net') && cookie === 'mode=relay') {
        return new Response(JSON.stringify({ code: 0 }), { status: 200 })
      }
      return new Response('', { status: 302 })
    }) as unknown as typeof fetch

    await expect(probeUrl('https://relay.fnos.net', 50, gateway)).resolves.toBe(true)
    await expect(probeUrl('http://192.168.2.100:5666', 50, gateway)).resolves.toBe(false)
  })

  it('中继候选能被解析出来（带标记探测通过），而不是永远回落到默认域名', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://fnos.net/api/v1/fn/con') {
        return new Response(
          JSON.stringify({ code: 0, data: { ddns: ['other-relay.fnos.net'] } }),
          { status: 200 },
        )
      }
      const cookie = (init?.headers as Record<string, string> | undefined)?.Cookie
      return cookie === 'mode=relay' ? new Response('{}', { status: 200 }) : new Response('', { status: 302 })
    }) as unknown as typeof fetch

    const resolved = await resolveFnIdToBaseUrl({
      fnId: 'my-nas',
      sha256Hex,
      md5Hex,
      fetchImpl,
      probeTimeoutMs: 50,
      cloudTimeoutMs: 50,
      useHttps: true,
    })

    expect(resolved).toContain('other-relay.fnos.net')
  })
})

describe('中继连接下的登录与浏览', () => {
  const relayConnection: ServerConnection = {
    id: 'srv-relay',
    providerId: 'fnos',
    displayName: 'chrisli',
    baseUrl: 'https://chrisli.fnos.net',
    username: 'aexachao',
  }

  it('登录和随后读取曲库都自动带中继标记', async () => {
    const seen: { url: string; cookie?: string; token?: string }[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      seen.push({ url: String(input), cookie: headers.Cookie, token: headers.authorization })
      const url = String(input)
      const body = url.includes('/user/password-login')
        ? { code: 0, msg: '', data: { userToken: 'tok-1', user: { guid: 'u1', name: 'aexachao', role: 'admin' } } }
        : { code: 0, msg: '', data: { list: [], total: 0 } }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as unknown as typeof fetch

    const provider = new FnosProvider(relayConnection, {
      sha256Hex,
      deviceId: 'device-1',
      fetchImpl,
    })
    await provider.login({ password: '示例密码-不是真实凭据' })
    await provider.albums({ page: 1, size: 20 })

    expect(seen).toHaveLength(2)
    for (const call of seen) {
      expect(call.cookie, call.url).toBe('mode=relay')
    }
    // 登录后的请求仍要带 token，中继标记不能把它挤掉
    expect(seen[1]?.token).toBe('tok-1')
  })
})
