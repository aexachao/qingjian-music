import { z } from 'zod'

/** 飞牛 FN Connect 云解析接口。 */
export const FN_CONNECT_API_URL = 'https://fnos.net/api/v1/fn/con'
const SECRET_KEY = 'anna'
const AUTHX_PREFIX = 'NDzZTVxnRKP8Z0jXg1VAMonaG8akvh'
const AUTHX_API_KEY = 'zIGtkc3dqZnJpd29qZXJqa2w7c'
const CLOUD_TIMEOUT_MS = 5_000

export function normalizeFnId(input: string): string {
  return input.trim().toLowerCase()
}

export function isFnId(input: string): boolean {
  const normalized = normalizeFnId(input)
  if (!normalized || normalized.includes('.') || normalized.includes(':') || normalized.includes('/')) return false
  if (normalized === 'localhost') return false
  return /^[a-z][a-z0-9-]{4,31}$/.test(normalized) && !normalized.endsWith('-')
}

export async function generateFnSign(
  fnId: string,
  timestamp: number,
  sha256Hex: (text: string) => Promise<string>,
): Promise<string> {
  return sha256Hex(`trim_connect\`${normalizeFnId(fnId)}\`${timestamp}\`${SECRET_KEY}`)
}

export async function generateAuthxHeader(
  bodyStr: string,
  timestamp: number,
  md5Hex: (text: string) => Promise<string>,
): Promise<string> {
  const nonce = String(Math.floor(Math.random() * 900000) + 100000)
  const bodyMd5 = await md5Hex(bodyStr)
  const rawAuth = `${AUTHX_PREFIX}_/api/v1/fn/con_${nonce}_${timestamp}_${bodyMd5}_${AUTHX_API_KEY}`
  const sign = await md5Hex(rawAuth)
  return `nonce=${nonce}&timestamp=${timestamp}&sign=${sign}`
}

const portSchema = z.number().int().min(1).max(65_535)
const endpointListSchema = z.array(z.string().min(1).max(255)).max(32)
const fnConnectDataSchema = z.object({
  port: z.object({ httpPort: portSchema.optional(), httpsPort: portSchema.optional() }).strict().optional(),
  ipv4: endpointListSchema.optional(),
  ipv6: endpointListSchema.optional(),
  ddns: endpointListSchema.optional(),
  fn: endpointListSchema.optional(),
  publicIpv4: endpointListSchema.optional(),
  publicIpv6: endpointListSchema.optional(),
}).strict()
const fnConnectResponseSchema = z.object({
  code: z.number().int(),
  data: fnConnectDataSchema.optional(),
}).strict()

export type FnConnectRawData = z.infer<typeof fnConnectDataSchema>

export interface FnConnectCandidate {
  url: string
  isLan: boolean
  priority: number
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => (/^(0|[1-9]\d{0,2})$/.test(part) ? Number(part) : -1))
  return octets.every((part) => part >= 0 && part <= 255) ? octets : null
}

function isIpv6(value: string): boolean {
  if (!/^[0-9a-f:.]+$/i.test(value) || !value.includes(':')) return false
  if ((value.match(/::/g) ?? []).length > 1) return false
  const [left = '', right = ''] = value.split('::')
  const groups = [...(left ? left.split(':') : []), ...(right ? right.split(':') : [])]
  let count = 0
  for (const group of groups) {
    const ipv4 = parseIpv4(group)
    if (ipv4) count += 2
    else if (/^[0-9a-f]{1,4}$/i.test(group)) count += 1
    else return false
  }
  return value.includes('::') ? count < 8 : count === 8
}

function isDangerousIp(value: string): boolean {
  const ipv4 = parseIpv4(value)
  if (ipv4) {
    const [a, b] = ipv4
    return a === 0 || a === 127 || (a === 169 && b === 254) || (a === 100 && b! >= 64 && b! <= 127) || a! >= 224
  }
  const normalized = value.toLowerCase()
  if (!isIpv6(normalized)) return true
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fe8') || normalized.startsWith('fe9')
    || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff')
}

function isValidHostname(value: string): boolean {
  if (value.length > 253 || value.endsWith('.')) return false
  const lower = value.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) return false
  return lower.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
}

/**
 * 是否飞牛官方中继域名（FN Connect 穿透）。
 *
 * 这个判断有两个用处，都是硬约束：
 *   1. 解析时只接受官方域名的中继候选，避免把任意域名当成穿透入口；
 *   2. **请求中继必须带 `Cookie: mode=relay`** —— 不带的话 nginx 会把请求
 *      302 到 `https://fnos.net/<fnid>/` 的浏览器门户页，接口一个都调不通。
 */
export function isOfficialRelayHostname(value: string): boolean {
  const lower = value.toLowerCase()
  return lower === 'fnos.net' || lower.endsWith('.fnos.net')
}

/** 中继模式标记。FN Connect 的 nginx 只有看到它，才会把请求转发到 NAS 而不是门户页 */
const FN_RELAY_COOKIE = 'mode=relay'

/**
 * 访问该地址时必须附带的中继请求头；非中继地址返回空对象。
 *
 * 判定收敛在**一处**：探测、登录、浏览、取流都从这里取。分开写迟早会漂移，
 * 而漂移的表现是「探测说地址可用，真正请求却拿到一张门户页 HTML」。
 */
export function relayHeadersFor(url: string): Record<string, string> {
  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    return {}
  }
  return isOfficialRelayHostname(hostname) ? { Cookie: FN_RELAY_COOKIE } : {}
}

function safeEndpoint(raw: string, defaultPort: number, expectedIp?: 4 | 6): { host: string; port: number } | null {
  const value = raw.trim()
  if (!value || /[/?#@\s]/.test(value)) return null
  let host = value
  let port = defaultPort
  if (value.startsWith('[')) {
    const match = /^\[([^\]]+)](?::(\d+))?$/.exec(value)
    if (!match) return null
    host = match[1]!
    if (match[2]) port = Number(match[2])
  } else if (!isIpv6(value)) {
    const match = /^([^:]+)(?::(\d+))?$/.exec(value)
    if (!match) return null
    host = match[1]!
    if (match[2]) port = Number(match[2])
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null
  const ipv4 = parseIpv4(host)
  const ipv6 = isIpv6(host)
  if (expectedIp === 4 && !ipv4) return null
  if (expectedIp === 6 && !ipv6) return null
  if (!ipv4 && !ipv6 && !isValidHostname(host)) return null
  if ((ipv4 || ipv6) && isDangerousIp(host)) return null
  return { host: ipv6 ? `[${host}]` : host.toLowerCase(), port }
}

function candidateUrl(raw: string, scheme: 'http' | 'https', defaultPort: number, expectedIp?: 4 | 6): string | null {
  const endpoint = safeEndpoint(raw, defaultPort, expectedIp)
  if (!endpoint) return null
  const defaultSchemePort = scheme === 'https' ? 443 : 80
  return `${scheme}://${endpoint.host}${endpoint.port === defaultSchemePort ? '' : `:${endpoint.port}`}`
}

export function parseCandidates(fnId: string, data: FnConnectRawData, useHttps: boolean): FnConnectCandidate[] {
  const normalizedFnId = normalizeFnId(fnId)
  const httpPort = data.port?.httpPort ?? 5666
  const httpsPort = data.port?.httpsPort ?? 5667
  const scheme = useHttps ? 'https' : 'http'
  const primaryPort = useHttps ? httpsPort : httpPort
  const candidates: FnConnectCandidate[] = []
  const add = (url: string | null, isLan: boolean, priority: number) => {
    if (url && !candidates.some((candidate) => candidate.url === url)) candidates.push({ url, isLan, priority })
  }

  for (const ip of data.ipv4 ?? []) {
    add(candidateUrl(ip, scheme, primaryPort, 4), true, 0)
    if (useHttps && httpPort !== primaryPort) add(candidateUrl(ip, 'http', httpPort, 4), true, 1)
  }
  for (const ip of data.ipv6 ?? []) add(candidateUrl(ip, scheme, primaryPort, 6), true, 2)
  for (const ddns of data.ddns ?? []) {
    const url = candidateUrl(ddns, scheme, primaryPort)
    if (url && isOfficialRelayHostname(new URL(url).hostname)) add(url, false, 5)
  }
  for (const ip of data.publicIpv4 ?? []) add(candidateUrl(ip, scheme, primaryPort, 4), false, 6)
  for (const ip of data.publicIpv6 ?? []) add(candidateUrl(ip, scheme, primaryPort, 6), false, 7)
  for (const relay of data.fn ?? []) {
    const url = candidateUrl(relay, 'https', 443)
    if (url && isOfficialRelayHostname(new URL(url).hostname)) add(url, false, 8)
  }
  add(`https://${normalizedFnId}.fnos.net`, false, 9)

  return candidates.sort((a, b) => a.priority - b.priority)
}

export async function probeUrl(url: string, timeoutMs = 1800, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${url.replace(/\/+$/, '')}/music/api/v1/sys/config`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      // 中继地址必须带中继标记：不带的话 nginx 一律 302 到门户页，
      // 于是**正确的穿透地址也会被这里判成不可达**。
      headers: relayHeadersFor(url),
    })
    return response.status >= 200 && response.status < 500 && (response.status < 300 || response.status >= 400)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export interface ResolveFnIdOptions {
  fnId: string
  sha256Hex: (text: string) => Promise<string>
  md5Hex: (text: string) => Promise<string>
  useHttps?: boolean
  fetchImpl?: typeof fetch
  onStatusChange?: (statusText: string) => void
  cloudTimeoutMs?: number
  probeTimeoutMs?: number
}

async function firstReachable(
  candidates: FnConnectCandidate[],
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  if (candidates.length === 0) return null
  return new Promise((resolve) => {
    let remaining = candidates.length
    let settled = false
    for (const candidate of candidates) {
      void probeUrl(candidate.url, timeoutMs, fetchImpl).then((ok) => {
        if (settled) return
        if (ok) {
          settled = true
          resolve(candidate.url)
          return
        }
        remaining -= 1
        if (remaining === 0) resolve(null)
      })
    }
  })
}

/** 将 FN ID 解析为首个实际可达的 BaseURL。 */
export async function resolveFnIdToBaseUrl(options: ResolveFnIdOptions): Promise<string> {
  const {
    sha256Hex,
    md5Hex,
    useHttps = true,
    fetchImpl = fetch,
    onStatusChange,
    cloudTimeoutMs = CLOUD_TIMEOUT_MS,
    probeTimeoutMs,
  } = options
  const fnId = normalizeFnId(options.fnId)
  if (!isFnId(fnId)) throw new Error('无效的 FN ID')
  const defaultFallback = `https://${fnId}.fnos.net`

  onStatusChange?.('正在查询 FN ID 地址...')
  let rawData: FnConnectRawData | null = null
  const cloudController = new AbortController()
  const cloudTimer = setTimeout(() => cloudController.abort(), cloudTimeoutMs)
  try {
    const timestamp = Date.now()
    const sign = await generateFnSign(fnId, timestamp, sha256Hex)
    const body = JSON.stringify({ fnId })
    const authx = await generateAuthxHeader(body, timestamp, md5Hex)
    const response = await fetchImpl(FN_CONNECT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'fn-sign': sign, authx },
      body,
      signal: cloudController.signal,
    })
    if (response.ok) {
      const parsed = fnConnectResponseSchema.safeParse(await response.json())
      if (parsed.success && parsed.data.code === 0 && parsed.data.data) rawData = parsed.data.data
    }
  } catch (error) {
    console.warn('FN Connect 云端解析请求失败，将使用默认穿透域名', error)
  } finally {
    clearTimeout(cloudTimer)
  }

  if (!rawData) return defaultFallback
  const candidates = parseCandidates(fnId, rawData, useHttps)
  onStatusChange?.('正在探测最优连接...')
  const lan = await firstReachable(candidates.filter((candidate) => candidate.isLan), probeTimeoutMs ?? 1200, fetchImpl)
  if (lan) return lan
  const remoteCandidates = candidates.filter((candidate) => !candidate.isLan)
  const remote = await firstReachable(remoteCandidates, probeTimeoutMs ?? 2000, fetchImpl)
  return remote ?? defaultFallback
}
