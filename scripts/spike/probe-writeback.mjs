#!/usr/bin/env node
/**
 * 飞牛写回能力探测（非破坏性）。
 *
 * ── 为什么要这个脚本 ────────────────────────────────────────────────────────
 * 我们想把「元数据整理意见」写回飞牛服务端，但飞牛 web 端产物里 track 域
 * **只有读接口**（list / metadata / *-detail/list / stream / transcode / roam），
 * 没有 edit / update / tag / rating。这强烈暗示：曲目标签编辑飞牛官方就不支持。
 * 本脚本用一个**不改数据**的手段去确认候选写端点到底存不存在。
 *
 * ── 探测原理（关键）────────────────────────────────────────────────────────
 * nginx 对任何未命中的路由都做 SPA fallback，返回 index.html（200 + text/html）。
 * 而真实存在的 API 端点即使参数非法，也会返回 **JSON**（形如 {code:100002,...}）。
 * 所以：
 *   · 用**空 body** POST 候选端点（空参数不会修改任何数据 → 非破坏性）；
 *   · 响应是 JSON 且含数字 code  ⇒ 端点**存在**（code 告诉我们是缺参/无权限/未找到）；
 *   · 响应是 HTML                ⇒ 端点**不存在**（被 SPA fallback 兜住）。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   export FNOS_BASE=http://192.168.x.x:5666        # 局域网直连地址（不要用中继域名）
 *   export FNOS_TOKEN='粘贴 userToken'               # 见 scripts/spike/README.md「先拿 token」
 *   node scripts/spike/probe-writeback.mjs
 *
 * 鉴权只需 `authorization: <裸 token>`（见 packages/provider-fnos/src/client.ts）。
 * 局域网直连无需 relay cookie。token 失效就按 README 重新换一个。
 */

const BASE = process.env.FNOS_BASE
const TOKEN = process.env.FNOS_TOKEN
const PREFIX = '/music/api/v1'

if (!BASE || !TOKEN) {
  console.error('缺少环境变量：请先 export FNOS_BASE 和 FNOS_TOKEN（见脚本头注释）')
  process.exit(1)
}

/**
 * 候选写端点清单。
 * - known:true 的是「已知存在」的锚点，用来验证探测法本身工作正常（应判定为 EXISTS）。
 * - 其余是我们想确认的元数据/评分写端点候选。
 * 全部用空 body 探测，绝不带真实 guid，保证不改数据。
 */
const CANDIDATES = [
  // —— 锚点：已知存在的写端点，验证探测法有效 ——
  { path: '/favorite-track/create', note: '收藏（已知存在，锚点）', known: true },
  { path: '/playlist/edit', note: '歌单改名（已知存在，锚点）', known: true },
  { path: '/playlist/create', note: '建歌单（已知存在，锚点）', known: true },

  // —— 曲目元数据/标签写回候选 ——
  { path: '/track/edit', note: '曲目编辑' },
  { path: '/track/update', note: '曲目更新' },
  { path: '/track/metadata/edit', note: '曲目元数据编辑' },
  { path: '/track/metadata/update', note: '曲目元数据更新' },
  { path: '/track/metadata/set', note: '曲目元数据设置' },
  { path: '/track/set-metadata', note: '曲目元数据设置(变体)' },
  { path: '/track/tag', note: '曲目标签' },
  { path: '/track/tag/edit', note: '曲目标签编辑' },
  { path: '/track/tags/update', note: '曲目标签批量更新' },

  // —— 评分写回候选（capabilities.ratings 目前为 false）——
  { path: '/track/rating', note: '曲目评分' },
  { path: '/track/rate', note: '曲目打分' },
  { path: '/track/set-rating', note: '曲目设分' },
  { path: '/rating/create', note: '评分创建' },

  // —— 专辑 / 艺人 / 流派 元数据写回候选 ——
  { path: '/album/edit', note: '专辑编辑' },
  { path: '/album/update', note: '专辑更新' },
  { path: '/artist/edit', note: '艺人编辑' },
  { path: '/artist/update', note: '艺人更新' },
  { path: '/genre/edit', note: '流派编辑' },
  { path: '/genre/create', note: '流派创建' },

  // —— 库级元数据偏好（shared-library 上有 metadataPreference 字段，可能有写接口）——
  { path: '/shared-library/edit', note: '库编辑(含 metadataPreference?)' },
]

const KNOWN_CODES = {
  0: 'ok',
  99999: 'invalidToken(token 失效，请重新换)',
  100001: 'unknownError',
  100002: 'invalidArguments(端点存在，只是缺参)',
  100003: 'forbiddenAdminOnly(端点存在，需 admin)',
  100005: 'notFound(端点存在，资源未找到)',
}

async function probe({ path, note, known }) {
  const url = `${BASE}${PREFIX}${path}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: TOKEN },
      body: '{}',
    })
    const ctype = res.headers.get('content-type') ?? ''
    const text = await res.text()

    const looksHtml = ctype.includes('text/html') || text.trimStart().startsWith('<')
    if (looksHtml) {
      return { path, note, known, verdict: 'MISSING', detail: `HTTP ${res.status} · SPA fallback (HTML)` }
    }

    let code
    try {
      const json = JSON.parse(text)
      code = typeof json?.code === 'number' ? json.code : undefined
    } catch {
      return { path, note, known, verdict: 'UNKNOWN', detail: `HTTP ${res.status} · 非 JSON: ${text.slice(0, 80)}` }
    }

    const codeMeaning = KNOWN_CODES[code] ?? `code=${code}`
    return { path, note, known, verdict: 'EXISTS', detail: `HTTP ${res.status} · ${codeMeaning}` }
  } catch (error) {
    return { path, note, known, verdict: 'ERROR', detail: String(error?.message ?? error) }
  }
}

const ICON = { EXISTS: '✅ 存在', MISSING: '⛔ 不存在', UNKNOWN: '❓ 未知', ERROR: '💥 错误' }

console.log(`探测目标：${BASE}${PREFIX}`)
console.log('（空 body POST，非破坏性；code=100002/100003/100005 都表示端点存在）\n')

const results = []
for (const c of CANDIDATES) {
  // 串行，避免并发把 NAS 打满；写探测本就轻量
  // eslint-disable-next-line no-await-in-loop
  results.push(await probe(c))
}

for (const r of results) {
  const tag = r.known ? ' [锚点]' : ''
  console.log(`${ICON[r.verdict].padEnd(6)}  ${r.path.padEnd(28)} ${r.note}${tag}`)
  console.log(`        ${r.detail}`)
}

// 锚点自检：已知存在的端点必须判定为 EXISTS，否则说明探测法/鉴权有问题
const anchorsOk = results.filter((r) => r.known).every((r) => r.verdict === 'EXISTS')
console.log('')
if (!anchorsOk) {
  console.log('⚠️  锚点未全部判定为「存在」——探测法或鉴权可能有问题，下面的结论不可信。')
  console.log('    先确认 FNOS_TOKEN 有效、FNOS_BASE 是局域网直连地址。')
} else {
  const found = results.filter((r) => !r.known && r.verdict === 'EXISTS')
  if (found.length === 0) {
    console.log('结论：候选元数据/评分写端点**全部不存在**——飞牛当前不支持写回，按「本地叠加层」方案设计。')
  } else {
    console.log('结论：以下写端点**意外存在**，值得进一步实测其 body 结构：')
    for (const r of found) console.log(`   · ${r.path}  (${r.detail})`)
  }
}
