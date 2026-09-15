import crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MusicError } from '@qj/core-domain'
import {
  FN_CONNECT_API_URL,
  FnIdUnreachableError,
  generateAuthxHeader,
  generateFnSign,
  isFnId,
  normalizeFnId,
  parseCandidates,
  probeUrl,
  resolveFnIdToBaseUrl,
} from '../../src/fn-connect'

const sha256Hex = async (text: string) => crypto.createHash('sha256').update(text).digest('hex')
const md5Hex = async (text: string) => crypto.createHash('md5').update(text).digest('hex')
const cloudResponse = (data: unknown) => ({ ok: true, json: async () => ({ code: 0, data }) }) as Response

function resolver(fetchImpl: typeof fetch, overrides: Partial<Parameters<typeof resolveFnIdToBaseUrl>[0]> = {}) {
  return resolveFnIdToBaseUrl({
    fnId: '  My-NAS  ', sha256Hex, md5Hex, fetchImpl, probeTimeoutMs: 20, cloudTimeoutMs: 20, ...overrides,
  })
}

describe('FN Connect', () => {
  afterEach(() => vi.restoreAllMocks())

  it('统一 trim + lower-case FN ID 并校验格式', () => {
    expect(normalizeFnId('  My-NAS  ')).toBe('my-nas')
    expect(isFnId('  My-NAS  ')).toBe(true)
    for (const value of ['', 'abcd', 'nas-', '12345', 'my_nas', 'localhost', 'nas.local', 'http://nas']) {
      expect(isFnId(value)).toBe(false)
    }
  })

  it('签名固定向量不漂移', async () => {
    expect(await generateFnSign(' My-NAS ', 1_700_000_000_000, sha256Hex)).toBe(
      '5e79777ecc20c25fb27549dc2fae0c1e3bc6f5979261a81d4df85c477251aa35',
    )
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(await generateAuthxHeader('{"fnId":"my-nas"}', 1_700_000_000_000, md5Hex)).toBe(
      'nonce=100000&timestamp=1700000000000&sign=2970079bdaf6804e560c9bdb567788e6',
    )
  })

  it('云 POST 使用规范化 body、签名 headers 和 abort signal', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === FN_CONNECT_API_URL) return cloudResponse({})
      throw new Error('unreachable')
    }) as unknown as typeof fetch
    // 云端返回空 data、其余地址都不可达 → 如实报错（这里只关心首个请求的形状）
    await expect(resolver(fetchImpl)).rejects.toBeInstanceOf(FnIdUnreachableError)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(url).toBe(FN_CONNECT_API_URL)
    expect(init).toMatchObject({
      method: 'POST',
      body: '{"fnId":"my-nas"}',
      headers: {
        'Content-Type': 'application/json',
        'fn-sign': '5e79777ecc20c25fb27549dc2fae0c1e3bc6f5979261a81d4df85c477251aa35',
        authx: 'nonce=100000&timestamp=1700000000000&sign=2970079bdaf6804e560c9bdb567788e6',
      },
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('只生成合法 http/https 候选，保留 LAN 私网并拒绝危险或畸形目标', () => {
    const candidates = parseCandidates('My-NAS', {
      port: { httpPort: 5666, httpsPort: 5667 },
      ipv4: ['192.168.2.100', '127.0.0.1', '169.254.1.2', '999.1.1.1'],
      ipv6: ['fd00::1', '::1', 'fe80::1', 'not-v6'],
      ddns: ['home.example.com:8443', 'my-nas.fnos.net:8443', 'localhost:5666', 'evil.test/path', 'bad host'],
      fn: ['my-nas.fnos.net:443', 'http://evil.example'],
      publicIpv4: ['1.2.3.4:5666', '0.0.0.0'],
      publicIpv6: ['2001:db8::1', '::'],
    }, true)
    const urls = candidates.map((candidate) => candidate.url)
    expect(urls).toContain('https://192.168.2.100:5667')
    expect(urls).toContain('https://[fd00::1]:5667')
    expect(urls).not.toContain('https://home.example.com:8443')
    expect(urls).toContain('https://my-nas.fnos.net:8443')
    expect(urls).toContain('https://[2001:db8::1]:5667')
    expect(urls).toContain('https://my-nas.fnos.net')
    expect(urls.every((url) => /^https?:\/\//.test(url))).toBe(true)
    expect(urls.join(' ')).not.toMatch(/localhost|127\.0\.0\.1|169\.254|999\.1|fe80|evil\.test|0\.0\.0\.0/)
  })

  it('严格拒绝 bad JSON、额外字段和非法端口，并如实报错而不是假装成功', async () => {
    for (const json of [
      async () => { throw new SyntaxError('bad json') },
      async () => ({ code: 0, data: { ipv4: ['192.168.1.2'], unexpected: true } }),
      async () => ({ code: 0, data: { port: { httpPort: 70000 } } }),
    ]) {
      const fetchImpl = vi.fn((input: RequestInfo | URL) =>
        String(input) === FN_CONNECT_API_URL
          ? Promise.resolve({ ok: true, json })
          : Promise.reject(new Error('unreachable')),
      ) as unknown as typeof fetch
      await expect(resolver(fetchImpl)).rejects.toBeInstanceOf(FnIdUnreachableError)
    }
  })

  it('云 POST 到时会 abort，并在一条线路都不通时报错（而不是悄悄回落）', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
    await expect(resolver(fetchImpl, { cloudTimeoutMs: 5 })).rejects.toBeInstanceOf(FnIdUnreachableError)
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(init.signal?.aborted).toBe(true)
  })

  it('probeUrl 成败都清理 timer，超时会 abort', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const alive = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ code: 0, msg: '', data: { serverGUID: 'g1' } }),
    }) as unknown as typeof fetch
    await expect(probeUrl('https://example.com', 5, alive)).resolves.toBe(true)
    const redirected = vi.fn().mockResolvedValue({ status: 302 }) as unknown as typeof fetch
    await expect(probeUrl('https://example.com', 5, redirected)).resolves.toBe(false)
    expect((redirected as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
    // 200 但是 HTML 门户页（设备离线时中继就会这么答）→ 不算可用
    const portal = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <') },
    }) as unknown as typeof fetch
    await expect(probeUrl('https://example.com', 5, portal)).resolves.toBe(false)
    const hanging = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('timeout')))
    })) as unknown as typeof fetch
    await expect(probeUrl('https://example.com', 5, hanging)).resolves.toBe(false)
    expect(clearSpy).toHaveBeenCalledTimes(4)
  })

  it('探测返回真正 first-success，不等待同组最慢失败', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === FN_CONNECT_API_URL) return Promise.resolve(cloudResponse({
        ddns: ['slow.fnos.net', 'fast.fnos.net'],
      }))
      if (url.includes('slow.fnos.net')) return new Promise(() => undefined)
      if (url.includes('fast.fnos.net')) {
        return Promise.resolve({ status: 200, json: async () => ({ code: 0, msg: '', data: {} }) })
      }
      return Promise.reject(new Error('unreachable'))
    }) as unknown as typeof fetch
    await expect(resolver(fetchImpl, { probeTimeoutMs: 1_000 })).resolves.toBe('https://fast.fnos.net:5667')
  })

  it('云端给出的 LAN first-success 优先于远程', async () => {
    const data = { ipv4: ['192.168.1.10'], ddns: ['remote.example.com'] }
    const reachableLan = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === FN_CONNECT_API_URL) return Promise.resolve(cloudResponse(data))
      return url.includes('192.168.1.10') ? Promise.resolve({ status: 401 }) : Promise.reject(new Error('fail'))
    }) as unknown as typeof fetch
    await expect(resolver(reachableLan, { useHttps: false })).resolves.toBe('http://192.168.1.10:5666')
  })
})

/**
 * 「FN ID 不好用」的真实形态：以前无论解析成不成功都回落到
 * `https://<fnid>.fnos.net`，于是失败被推迟到登录那一步，显示成
 * 「账号或密码不正确」—— 用户会一直去改密码，而问题在地址上。
 */
describe('FN ID 报真实错误', () => {
  it('设备离线（中继回 200 门户页）→ 明确指出「不是飞牛音乐接口」', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === FN_CONNECT_API_URL) throw new Error('cloud unreachable')
      // 中继在设备离线时就是这个形状：200 + HTML
      return { status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }
    }) as unknown as typeof fetch

    await expect(resolver(fetchImpl)).rejects.toThrow(/无法连接到 FN ID「my-nas」/)
    await expect(resolver(fetchImpl)).rejects.toThrow(/不是飞牛音乐接口/)
  })

  it('域名根本不存在 → 报「域名无法解析或网络不通」', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === FN_CONNECT_API_URL) throw new Error('cloud unreachable')
      throw new Error('getaddrinfo ENOTFOUND')
    }) as unknown as typeof fetch
    await expect(resolver(fetchImpl)).rejects.toThrow(/域名无法解析或网络不通/)
  })

  it('错误类型是普通 Error —— 上层才不会把它翻译成「账号或密码不正确」', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('unreachable')
    }) as unknown as typeof fetch
    const error = await resolver(fetchImpl).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(MusicError)
  })
})

/**
 * 内网优先：同一个 FN ID 在家走局域网比绕公网中继快得多。但历史里的局域网地址
 * 完全可能是**另一台** NAS，所以采纳前必须用服务端的 serverGUID 证明身份。
 */
describe('FN ID 内网优先（须先证明是同一台设备）', () => {
  const RELAY_GUID = 'guid-relay'

  function lanProbeFetch(lanGuid: string) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === FN_CONNECT_API_URL) return cloudResponse({})
      if (url.includes('192.168.2.100')) {
        return new Response(JSON.stringify({ code: 0, msg: '', data: { serverGUID: lanGuid } }), { status: 200 })
      }
      if (url.includes('my-nas.fnos.net')) {
        return new Response(JSON.stringify({ code: 0, msg: '', data: { serverGUID: RELAY_GUID } }), { status: 200 })
      }
      throw new Error('unreachable')
    }) as unknown as typeof fetch
  }

  it('内网地址是同一台设备（serverGUID 相同）→ 走内网', async () => {
    const resolved = await resolver(lanProbeFetch(RELAY_GUID), {
      knownCandidates: ['http://192.168.2.100:5666'],
    })
    expect(resolved).toBe('http://192.168.2.100:5666')
  })

  it('内网地址是**另一台** NAS → 不采纳，老老实实走中继', async () => {
    const resolved = await resolver(lanProbeFetch('guid-另一台机器'), {
      knownCandidates: ['http://192.168.2.100:5666'],
    })
    expect(resolved).toBe('https://my-nas.fnos.net')
  })

  it('没给历史地址时不额外探测，直接用云端/中继', async () => {
    const resolved = await resolver(lanProbeFetch(RELAY_GUID))
    expect(resolved).toBe('https://my-nas.fnos.net')
  })
})
