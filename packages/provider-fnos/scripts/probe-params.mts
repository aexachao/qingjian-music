/**
 * 参数名探测脚本（一次性工具）。
 *
 * 飞牛的详情类接口参数名没有公开文档，这个脚本对着真实 NAS 逐个候选试，
 * 把「哪个参数名能用」打印出来，用于校准 src/provider.ts 里的实现。
 *
 * 用法：
 *   FNOS_BASE_URL=http://192.168.2.100:5666 FNOS_USERNAME=test FNOS_PASSWORD=xxx \
 *   node --experimental-strip-types packages/provider-fnos/scripts/probe-params.mts
 */
import { createHash } from 'node:crypto'

const baseUrl = process.env['FNOS_BASE_URL']
const username = process.env['FNOS_USERNAME']
const password = process.env['FNOS_PASSWORD']
if (!baseUrl || !username || !password) {
  console.error('缺少 FNOS_BASE_URL / FNOS_USERNAME / FNOS_PASSWORD 环境变量')
  process.exit(1)
}
const api = `${baseUrl.replace(/\/+$/, '')}/music/api/v1`
const sha256 = (input: string) => createHash('sha256').update(input).digest('hex')

async function call(path: string, options: { method?: string; query?: Record<string, string | number>; body?: unknown; token?: string } = {}) {
  const url = new URL(`${api}${path}`)
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, String(value))
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(options.token ? { authorization: options.token } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  try {
    return JSON.parse(text) as { code: number; msg?: string; data?: unknown }
  } catch {
    return { code: -1, msg: text.slice(0, 80) }
  }
}

const login = await call('/user/password-login', {
  method: 'POST',
  body: { username, password: sha256(password), deviceId: 'qj-probe' },
})
const token = (login.data as { userToken?: string } | undefined)?.userToken
if (!token) {
  console.error('登录失败：', login)
  process.exit(1)
}
console.log('登录成功')

const trackPage = await call('/track/list', { query: { page: 1, size: 1 }, token })
const track = (trackPage.data as { list?: Array<{ guid: string; album?: { guid: string }; artists?: Array<{ guid: string }> }> }).list?.[0]
const albumGuid = track?.album?.guid ?? ''
const artistGuid = track?.artists?.[0]?.guid ?? ''
const genrePage = await call('/genre/list', { query: { page: 1, size: 1 }, token })
const genreGuid = (genrePage.data as { list?: Array<{ guid: string }> }).list?.[0]?.guid ?? ''

const candidates = ['guid', 'albumGuid', 'artistGuid', 'genreGuid', 'playlistGuid', 'albumGUID', 'artistGUID', 'id', 'GUID']

const cases: Array<{ path: string; value: string; label: string }> = [
  { path: '/track/album-detail/list', value: albumGuid, label: '专辑内曲目' },
  { path: '/track/artist-detail/list', value: artistGuid, label: '艺术家曲目' },
  { path: '/track/genre-detail/list', value: genreGuid, label: '流派曲目' },
  { path: '/album/artist-detail/list', value: artistGuid, label: '艺术家专辑' },
]

for (const { path, value, label } of cases) {
  if (!value) {
    console.log(`\n[${label}] ${path} -> 缺少样本 id，跳过`)
    continue
  }
  const results: string[] = []
  for (const key of candidates) {
    const response = await call(path, { query: { [key]: value, page: 1, size: 2 }, token })
    const count = (response.data as { list?: unknown[] } | undefined)?.list?.length ?? 0
    if (response.code === 0) results.push(`${key} ✅ code=0 n=${count}`)
  }
  console.log(`\n[${label}] ${path}`)
  console.log(results.length ? results.map((r) => `  ${r}`).join('\n') : '  没有候选参数命中，需要重新抓包')
}

// 收藏的写操作（默认不执行，避免改动真实数据）
if (process.env['FNOS_PROBE_MUTATE'] === '1' && track) {
  for (const key of ['guid', 'trackGuid', 'trackGUID']) {
    const created = await call('/favorite-track/create', { method: 'POST', body: { [key]: track.guid }, token })
    console.log(`\n[收藏] create ${key} -> code=${created.code} ${created.msg ?? ''}`)
    if (created.code === 0) {
      const deleted = await call('/favorite-track/delete', { method: 'POST', body: { [key]: track.guid }, token })
      console.log(`[收藏] delete ${key} -> code=${deleted.code} ${deleted.msg ?? ''}`)
      break
    }
  }
}

// 漫游电台
const roam = await call('/track/roam-start', { method: 'POST', body: { deviceId: 'qj-probe' }, token })
console.log(`\n[漫游] roam-start -> code=${roam.code} keys=${Object.keys((roam.data ?? {}) as object).join(',')}`)
console.log(JSON.stringify(roam.data).slice(0, 400))
