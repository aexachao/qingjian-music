#!/usr/bin/env node
/**
 * 飞牛音乐 web 端「全部支持操作」提取器。
 *
 * ── 为什么要它 ──────────────────────────────────────────────────────────────
 * 之前仓库里的端点清单是从**旧版** web 产物手工提取的，已经过时（漏了曲目元数据编辑等）。
 * 真正的事实来源是**当前 NAS 上跑的 web 前端 JS bundle**——里面以字符串字面量的形式
 * 写死了它调用的所有 API 路径。本脚本把 bundle 抓下来，把所有 API 端点扒出来，得到**完整清单**。
 *
 * ── 原理 ────────────────────────────────────────────────────────────────────
 * 1. 抓 SPA 入口 HTML，找出它引用的 JS 资源（<script src>、modulepreload、assets/*.js）。
 * 2. 逐个抓 JS；从每个 JS 里再找它动态 import 的 chunk（"assets/xxx.js" 字面量），再抓一层。
 * 3. 在所有 JS 文本上跑端点正则，按域分组去重打印。
 * 静态资源一般不需要鉴权；个别部署会 gate，带上 FNOS_TOKEN 更稳。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   export FNOS_BASE=http://192.168.x.x:5666      # 局域网直连（不要用中继域名）
 *   export FNOS_TOKEN='粘贴 userToken'             # 可选；见 scripts/spike/README.md
 *   node scripts/spike/extract-endpoints.mjs
 *
 * 把输出整段发回来，我据此重写 endpoints.ts / provider / capabilities / 路线图。
 */

const BASE = (process.env.FNOS_BASE ?? '').replace(/\/+$/, '')
const TOKEN = process.env.FNOS_TOKEN
if (!BASE) {
  console.error('缺少 FNOS_BASE（例：http://192.168.x.x:5666）')
  process.exit(1)
}

const authHeaders = TOKEN ? { authorization: TOKEN } : {}

async function fetchText(url) {
  // NAS 偶发丢请求，带几次重试更稳
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: authHeaders })
      const ctype = res.headers.get('content-type') ?? ''
      const text = await res.text()
      if (text) return { ok: res.ok, status: res.status, ctype, text }
    } catch (error) {
      if (attempt === 3) return { ok: false, status: 0, ctype: '', text: '', error: String(error?.message ?? error) }
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return { ok: false, status: 0, ctype: '', text: '' }
}

function resolveUrl(ref, baseUrl) {
  try {
    return new URL(ref, baseUrl).toString()
  } catch {
    return null
  }
}

/** 从一段文本里扒出 JS 资源引用（相对/绝对都收） */
function findJsRefs(text) {
  const refs = new Set()
  const patterns = [
    /<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi,
    /<link[^>]+href=["']([^"']+\.js[^"']*)["']/gi,
    /["'`]((?:\.?\/)?assets\/[^"'`]+\.js)["'`]/gi,
    /["'`]([^"'`]*\/js\/[^"'`]+\.js)["'`]/gi,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(text)) !== null) refs.add(m[1])
  }
  return [...refs]
}

/** 端点正则：飞牛所有 API 都在这些域下 */
const ENDPOINT_RE = new RegExp(
  String.raw`["'` +
    '`' +
    `](\\/?(?:music\\/api\\/v\\d+\\/)?(?:track|album|artist|genre|playlist|favorite-track|favorite|play-history|history|lyric|search|shared-library|library|task|user|settings|sys|initialization|event|static|stream|app-center|metadata|tag|tags|rating|ratings|scan|folder|file|media)(?:\\/[a-z0-9:_.-]+)*)["'` +
    '`' +
    `]`,
  'gi',
)

function findEndpoints(text) {
  const found = new Set()
  let m
  while ((m = ENDPOINT_RE.exec(text)) !== null) {
    let path = m[1]
    path = path.replace(/^\/?music\/api\/v\d+/, '') // 去掉前缀，统一
    if (!path.startsWith('/')) path = `/${path}`
    // 过滤明显不是端点的（纯文件、含空格等）
    if (/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ttf|map|html)$/i.test(path)) continue
    if (/\s/.test(path)) continue
    found.add(path)
  }
  return found
}

console.log(`目标：${BASE}`)
console.log('抓取 SPA 入口…')

const visited = new Set()
const allEndpoints = new Set()
const jsQueue = []

// 1) 入口 HTML
const index = await fetchText(`${BASE}/`)
if (!index.text) {
  console.error(`拿不到入口页：HTTP ${index.status} ${index.error ?? ''}`)
  process.exit(1)
}
for (const ref of findJsRefs(index.text)) {
  const u = resolveUrl(ref, `${BASE}/`)
  if (u) jsQueue.push(u)
}
// 入口 HTML 本身也扫一遍端点（有的把配置内联在 HTML）
for (const e of findEndpoints(index.text)) allEndpoints.add(e)

if (jsQueue.length === 0) {
  console.error('入口页里没找到 JS 资源引用。可能 web 端路径不是根路径，或需要鉴权。')
  console.error('入口页前 300 字：\n' + index.text.slice(0, 300))
  process.exit(1)
}

// 2) 两级抓取 JS（入口 chunk + 它们动态 import 的 chunk）
let level = 0
let frontier = [...new Set(jsQueue)]
while (frontier.length > 0 && level < 3) {
  console.log(`抓取 JS chunk（第 ${level + 1} 层，${frontier.length} 个）…`)
  const next = []
  for (const url of frontier) {
    if (visited.has(url)) continue
    visited.add(url)
    // eslint-disable-next-line no-await-in-loop
    const js = await fetchText(url)
    if (!js.text || js.ctype.includes('text/html')) continue
    for (const e of findEndpoints(js.text)) allEndpoints.add(e)
    for (const ref of findJsRefs(js.text)) {
      const u = resolveUrl(ref, url)
      if (u && !visited.has(u)) next.push(u)
    }
  }
  frontier = [...new Set(next)]
  level++
}

console.log(`\n共抓取 ${visited.size} 个 JS chunk，提取到 ${allEndpoints.size} 个端点。\n`)

// 3) 按域分组打印，区分「多段（路径可靠）」与「单段域名（可能是动态拼接/客户端常量，不可靠）」
const groups = new Map()
for (const ep of allEndpoints) {
  const domain = ep.split('/')[1] ?? '(root)'
  if (!groups.has(domain)) groups.set(domain, [])
  groups.get(domain).push(ep)
}
const WRITE_HINT = /(create|edit|update|delete|set|add|remove|scan|tag|rating|rate|purge|move|reorder|sort|import|upload|patch|save|modify|rebuild|reconnect|retry|cancel)/i
const multiSeg = []
const bareOnly = []
for (const domain of [...groups.keys()].sort()) {
  const eps = groups.get(domain).sort()
  const hasMulti = eps.some((e) => e.split('/').length > 2)
  if (hasMulti) multiSeg.push([domain, eps])
  else bareOnly.push(domain)
}
console.log('==== 多段端点（路径可靠）====\n')
for (const [domain, eps] of multiSeg) {
  console.log(`## ${domain}`)
  for (const ep of eps) {
    const write = WRITE_HINT.test(ep) ? '  ⟵ 写操作?' : ''
    console.log(`  ${ep}${write}`)
  }
  console.log('')
}
console.log('==== 单段域名（仅出现域名、无完整路径）====')
console.log('这些域的具体端点是**动态拼接**的（代码里不是完整字面量），静态提取拿不到完整路径。')
console.log('若里面有 tag/rating/metadata/media/library，很可能就是「编辑音乐信息」的写入口，需抓包确认：')
console.log('  ' + bareOnly.join('  '))
console.log('')
console.log('—— 提示 ——')
console.log('1) 标了「写操作?」的重点看。')
console.log('2) 要确认「编辑曲目/专辑元数据」的确切端点：在飞牛音乐 web 里打开浏览器 DevTools → Network，')
console.log('   对一首歌点「编辑」并保存，把那个请求的 URL + method + payload 发回来。')
