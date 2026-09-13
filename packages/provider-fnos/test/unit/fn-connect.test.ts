import crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FN_CONNECT_API_URL,
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
    await resolver(fetchImpl)
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

  it('严格拒绝 bad JSON、额外字段和非法端口并安全回退', async () => {
    for (const json of [
      async () => { throw new SyntaxError('bad json') },
      async () => ({ code: 0, data: { ipv4: ['192.168.1.2'], unexpected: true } }),
      async () => ({ code: 0, data: { port: { httpPort: 70000 } } }),
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json }) as unknown as typeof fetch
      await expect(resolver(fetchImpl)).resolves.toBe('https://my-nas.fnos.net')
    }
  })

  it('云 POST 到时会 abort 并回退', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
    await expect(resolver(fetchImpl, { cloudTimeoutMs: 5 })).resolves.toBe('https://my-nas.fnos.net')
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(init.signal?.aborted).toBe(true)
  })

  it('probeUrl 成败都清理 timer，超时会 abort', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await expect(probeUrl('https://example.com', 5, vi.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch)).resolves.toBe(true)
    const redirected = vi.fn().mockResolvedValue({ status: 302 }) as unknown as typeof fetch
    await expect(probeUrl('https://example.com', 5, redirected)).resolves.toBe(false)
    expect((redirected as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
    const hanging = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('timeout')))
    })) as unknown as typeof fetch
    await expect(probeUrl('https://example.com', 5, hanging)).resolves.toBe(false)
    expect(clearSpy).toHaveBeenCalledTimes(3)
  })

  it('探测返回真正 first-success，不等待同组最慢失败', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === FN_CONNECT_API_URL) return Promise.resolve(cloudResponse({
        ddns: ['slow.fnos.net', 'fast.fnos.net'],
      }))
      if (url.includes('slow.fnos.net')) return new Promise(() => undefined)
      if (url.includes('fast.fnos.net')) return Promise.resolve({ status: 200 })
      return Promise.reject(new Error('unreachable'))
    }) as unknown as typeof fetch
    await expect(resolver(fetchImpl, { probeTimeoutMs: 1_000 })).resolves.toBe('https://fast.fnos.net:5667')
  })

  it('LAN first-success 优先于远程；全部失败只回退官方域名', async () => {
    const data = { ipv4: ['192.168.1.10'], ddns: ['remote.example.com'] }
    const reachableLan = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === FN_CONNECT_API_URL) return Promise.resolve(cloudResponse(data))
      return url.includes('192.168.1.10') ? Promise.resolve({ status: 401 }) : Promise.reject(new Error('fail'))
    }) as unknown as typeof fetch
    await expect(resolver(reachableLan, { useHttps: false })).resolves.toBe('http://192.168.1.10:5666')

    const allFail = vi.fn((input: RequestInfo | URL) => String(input) === FN_CONNECT_API_URL
      ? Promise.resolve(cloudResponse(data))
      : Promise.reject(new Error('fail'))) as unknown as typeof fetch
    await expect(resolver(allFail, { useHttps: false })).resolves.toBe('https://my-nas.fnos.net')
  })
})
