import { isLoopbackOrPrivateHost } from '@qj/provider-api'
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

/** 官方中继域名。取自 NAS 自己的域配置，只认这三个 */
export const RELAY_DOMAINS = ['fnos.net', '5ddd.com', 'trzznas.com'] as const

/** 一次探测为什么没成功 —— 用来给人一句能看懂的话，而不是笼统的「连接失败」 */
export type ProbeFailure = 'network' | 'not-music-api' | 'http-error'

export interface ProbeResult {
  url: string
  reachable: boolean
  /**
   * 只有真的连上音乐接口才有。用来确认「内网地址和穿透地址是同一台设备」——
   * 历史里可能存着**另一台** NAS 的地址，光看「能不能连上」会连错机器。
   */
  serverGUID?: string
  reason?: ProbeFailure
}

function isMusicEnvelope(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null && 'code' in payload
}

function extractServerGuid(payload: unknown): string | undefined {
  if (!isMusicEnvelope(payload)) return undefined
  const data = (payload as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return undefined
  const guid = (data as { serverGUID?: unknown }).serverGUID
  return typeof guid === 'string' && guid ? guid : undefined
}

/**
 * 探测一个地址是不是可用的飞牛音乐服务。
 *
 * ── 为什么 2xx 还要再验一次内容 ──────────────────────────────────────────────
 * FN Connect 的中继在**设备离线**时会返回一张 200 的 HTML 提示页。只看状态码
 * 会把它当成「地址可用」，于是后续登录拿到 HTML、被翻译成 `protocol`，
 * 用户看到的是「账号或密码不正确」—— 一个和真实原因毫不相干的提示。
 *
 * 判定分级：
 *   · 4xx → 可达。服务在，只是拒绝了这次请求（探测只需要知道「这儿有服务」）
 *   · 3xx → 不可达。中继不带中继标记时的门户跳转正是这个形状
 *   · 2xx → 必须能解出音乐接口的信封，否则算「连上了但不是音乐接口」
 */
export async function probeSysConfig(
  url: string,
  timeoutMs = 1800,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
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
    const status = response.status
    if (status >= 300 && status < 400) return { url, reachable: false, reason: 'http-error' }
    if (status >= 400 && status < 500) return { url, reachable: true }
    if (status < 200 || status >= 300) return { url, reachable: false, reason: 'http-error' }

    let payload: unknown
    try {
      payload = typeof response.json === 'function' ? await response.json() : JSON.parse(await response.text())
    } catch {
      return { url, reachable: false, reason: 'not-music-api' }
    }
    if (!isMusicEnvelope(payload)) return { url, reachable: false, reason: 'not-music-api' }
    const serverGUID = extractServerGuid(payload)
    return serverGUID ? { url, reachable: true, serverGUID } : { url, reachable: true }
  } catch {
    return { url, reachable: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

export async function probeUrl(url: string, timeoutMs = 1800, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  return (await probeSysConfig(url, timeoutMs, fetchImpl)).reachable
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
  /**
   * 已知属于同一台设备的候选地址（例如历史记录里保存的局域网地址）。
   * 与中继一起探测；确认是同一台机器后**优先走内网** —— 中继要绕一圈公网，
   * 浏览和封面都会明显变慢。
   */
  knownCandidates?: string[]
}

/**
 * FN ID 一条线路都连不上时抛出。
 *
 * **故意继承普通 Error 而不是 MusicError**：上层拿到 MusicError 的 `protocol`
 * 会把它显示成「账号或密码不正确」，而这里的问题和凭据毫无关系。
 * 用普通 Error 才能把真实原因原样交到用户面前。
 */
export class FnIdUnreachableError extends Error {
  constructor(
    readonly fnId: string,
    readonly probes: ProbeResult[],
  ) {
    super(describeUnreachable(fnId, probes))
    this.name = 'FnIdUnreachableError'
  }
}

function describeUnreachable(fnId: string, probes: ProbeResult[]): string {
  const reasons = new Set(probes.map((probe) => probe.reason).filter(Boolean))
  const detail = reasons.has('not-music-api')
    ? '地址能连上，但返回的不是飞牛音乐接口（该设备可能没开机，或还没开启远程访问）'
    : reasons.has('http-error')
      ? '服务器返回了错误状态'
      : '域名无法解析或网络不通'
  return `无法连接到 FN ID「${fnId}」：${detail}。请确认 FN ID 没写错，并在飞牛的「远程访问」里确认 FN Connect 已开启。`
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * 并发探测，**返回第一个可达的结果**，不为同组里最慢的那条买单。
 * 全部不可达时返回 null，并把每条的原因一起带回去（错误信息要用）。
 */
async function firstReachableProbe(
  candidates: FnConnectCandidate[],
  timeoutMs: number,
  fetchImpl: typeof fetch,
  accept: (result: ProbeResult) => boolean = (result) => result.reachable,
): Promise<{ hit: ProbeResult | null; probes: ProbeResult[] }> {
  if (candidates.length === 0) return { hit: null, probes: [] }
  return new Promise((resolve) => {
    const probes: ProbeResult[] = []
    let remaining = candidates.length
    let settled = false
    for (const candidate of candidates) {
      void probeSysConfig(candidate.url, timeoutMs, fetchImpl).then((result) => {
        probes.push(result)
        if (!settled && accept(result)) {
          settled = true
          resolve({ hit: result, probes })
          return
        }
        remaining -= 1
        if (remaining === 0 && !settled) resolve({ hit: null, probes })
      })
    }
  })
}

function dedupe(candidates: FnConnectCandidate[]): FnConnectCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false
    seen.add(candidate.url)
    return true
  })
}

/** 云端给出的候选 + 写死的三个官方中继域名（云端解析接口已失效，中继是唯一的兜底） */
function trustedCandidatesFor(
  fnId: string,
  rawData: FnConnectRawData | null,
  useHttps: boolean,
): FnConnectCandidate[] {
  const cloud = rawData ? parseCandidates(fnId, rawData, useHttps) : []
  const relays: FnConnectCandidate[] = RELAY_DOMAINS.map((domain, index) => ({
    url: `https://${fnId}.${domain}`,
    isLan: false,
    priority: 11 + index,
  }))
  return dedupe([...cloud, ...relays]).sort((a, b) => a.priority - b.priority)
}

/** 历史里存过的地址。**不是这台设备的权威来源**，采纳前必须靠 serverGUID 确认身份 */
function untrustedCandidatesFor(urls: string[]): FnConnectCandidate[] {
  return dedupe(
    urls.map((url) => {
      const normalized = url.replace(/\/+$/, '')
      return {
        url: normalized,
        isLan: isLoopbackOrPrivateHost(hostnameOf(normalized)),
        priority: 0,
      }
    }),
  )
}

/**
 * 把 FN ID 解析成一个**确认可用**的 BaseURL。
 *
 * 曾经这里是「解析不出来就悄悄回落到 `https://<fnid>.fnos.net`」——
 * 看起来永远成功，实际把「FN ID 写错了」和「服务器不可达」都变成了后续登录时
 * 一句莫名其妙的「账号或密码不正确」。现在解析不出来就抛 `FnIdUnreachableError`。
 *
 * 线路选择顺序：内网 → 云端候选 → 中继。**内网只在能证明是同一台设备时才用**
 * （见下方 `lanMatch`）。
 */
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
    // 云端拿不到候选不是致命错误：下面还有写死的中继域名兜底
    console.warn('FN Connect 云端解析请求失败，改用中继域名直接探测', error)
  } finally {
    clearTimeout(cloudTimer)
  }

  const trusted = trustedCandidatesFor(fnId, rawData, useHttps)
  const untrusted = untrustedCandidatesFor(options.knownCandidates ?? [])
  onStatusChange?.('正在探测最优连接...')

  // 先探内网：同一个 FN ID 在家走内网比绕公网中继快得多，探测也更快（局域网延迟低）
  const lanRound = await firstReachableProbe(
    trusted.filter((candidate) => candidate.isLan),
    probeTimeoutMs ?? 1200,
    fetchImpl,
  )
  if (lanRound.hit) return lanRound.hit.url

  const remoteRound = await firstReachableProbe(
    trusted.filter((candidate) => !candidate.isLan),
    probeTimeoutMs ?? 2000,
    fetchImpl,
  )
  const probes = [...lanRound.probes, ...remoteRound.probes]
  if (!remoteRound.hit) {
    // 内网地址也一起探一遍：虽然不一定采纳，但它们的失败原因同样值得报出来
    if (untrusted.length > 0) {
      const extra = await firstReachableProbe(untrusted, probeTimeoutMs ?? 1200, fetchImpl)
      probes.push(...extra.probes)
    }
    throw new FnIdUnreachableError(fnId, probes)
  }

  const remote = remoteRound.hit
  if (untrusted.length === 0) return remote.url

  /**
   * 内网优先，但**必须先证明是同一台设备**：历史里的局域网地址完全可能是另一台 NAS
   * （用户有两台机器时很常见），连错了只会看到「别人的音乐库」而且看不出哪里不对。
   * 判据用服务端自己的 `serverGUID` —— 比看起来像不像靠谱得多。
   */
  const knownRound = await firstReachableProbe(
    untrusted,
    probeTimeoutMs ?? 1200,
    fetchImpl,
    (result) => result.reachable && Boolean(result.serverGUID) && result.serverGUID === remote.serverGUID,
  )
  return knownRound.hit?.url ?? remote.url
}
