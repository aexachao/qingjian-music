#!/usr/bin/env node
/**
 * 架构守卫 —— 把「只写在文档 / MEMORY.md 里」的硬规则变成可执行检查。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * 这个仓库的硬规则质量很高，但**全部以散文形式存在**（交接文档、MEMORY.md、
 * 代码注释）。散文规则会衰减，而且衰减是静默的：
 *
 *   · `src/lib/haptics.ts` 的注释明确写了「触感统一走这里，不要各处手写
 *     Haptics.impactAsync」—— 实际有 9 个文件、24 处绕过了它；
 *   · `src/player/setup.ts` 的「热重载容错」分支因为匹配串少了 "been"
 *     而从来没命中过，注释却写着它工作正常。
 *
 * 这类问题的共同点是「不报错、不崩溃，只是悄悄不生效」。靠 review 一个个抓
 * 是不可持续的，所以把能机械判定的部分固化成检查。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   node scripts/guard-architecture.mjs                  # 检查（新增违规即失败）
 *   node scripts/guard-architecture.mjs --update-baseline # 下调基线并写回
 *   node scripts/guard-architecture.mjs --strict          # 连存量债务一起失败
 *
 * ── 棘轮（ratchet）说明 ─────────────────────────────────────────────────────
 * 存量债务记在 scripts/guard-baseline.json 里，**只允许下调**：
 *   · 新增违规 → 失败；
 *   · 修掉债务 → 提示把基线降下来（用 --update-baseline）。
 * 这样规则可以先落地、再逐步还债，而不是一次性拦下所有人。
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const BASELINE_PATH = join(ROOT, 'scripts', 'guard-baseline.json')

const MOBILE_SRC = 'apps/mobile/src'
const ROUTER_TYPES = 'apps/mobile/.expo/types/router.d.ts'

/** 触感收口的唯一出口 */
const HAPTICS_MODULE = `${MOBILE_SRC}/lib/haptics.ts`
/** 允许出现 console.log 的调试自检页 */
const CONSOLE_LOG_ALLOWLIST = [`${MOBILE_SRC}/app/dev-smoke.tsx`]
/**
 * 允许出现十六进制颜色字面量的文件。
 * 只有致命错误屏 —— 它**刻意自我隔离**（主题 Provider 可能就是崩掉的那一环），
 * 所以不能用 theme token。除此之外组件必须走 `colors.<角色>`。
 */
const HEX_LITERAL_ALLOWLIST = [`${MOBILE_SRC}/components/fatal-error-screen.tsx`]
/** 颜色 token 的定义处（唯一允许直接写 L1 色值 / 直接用 accent 的地方） */
const THEME_DIR = `${MOBILE_SRC}/theme/`

/**
 * 「一个文件只做一件事」的可执行阈值。
 *
 * ── 为什么要有它 ────────────────────────────────────────────────────────────
 * 散文规范（「别把很多功能堆进一个文件」）会静默衰减；本仓库历史上就长出了
 * 1700+ 行的 controller.ts、1600+ 行塞 7 个组件的 player-queue.tsx。超大文件
 * 的代价是「改一处要先读完一屏不相干的逻辑」，review 也看不动。
 *
 * ── 两个维度，各治一种病 ────────────────────────────────────────────────────
 *   · MAX_FILE_LINES —— 体量：一个文件再内聚也不该让人滚半天。
 *   · MAX_COMPONENTS_PER_FILE —— 职责：一个 .tsx 里塞一堆顶层组件，几乎必然是
 *     「本可以拆成多个文件」。纯逻辑模块（.ts）的多导出不在此列，另说。
 *
 * 两条都走棘轮：存量记入基线只许减少，新增/超标即失败。拆分到位后基线自动变短。
 */
const MAX_FILE_LINES = 400
const MAX_COMPONENTS_PER_FILE = 3

/**
 * 顶层「组件/类」定义的识别：
 *   export function Foo(  /  function Foo(  （大写开头 + 第二个字母小写，避开 FC 之类缩写噪声）
 *   const Foo = …         （大写开头的常量赋值，覆盖 memo()/forwardRef()/styled 包裹）
 *   class Foo             （少见，但一并计入）
 * 只匹配行首（去注释后），不深入嵌套，足以把「一个文件几个组件」量化出来。
 */
const COMPONENT_DEFINITION =
  /^(export\s+)?(function\s+[A-Z][a-z]|const\s+[A-Z][a-z][A-Za-z0-9]*\s*[:=]|class\s+[A-Z])/

// ─────────────────────────────────────────────────────────────────────────────
// 基础设施
// ─────────────────────────────────────────────────────────────────────────────

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

/** 递归收集文件，返回相对 ROOT 的 POSIX 路径 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.expo',
  '.cache',
  '.pnpm-store',
  'ios',
  'android',
  'Pods',
  'vendor',
])

function walk(relDir, { exts }) {
  const abs = join(ROOT, relDir)
  if (!existsSync(abs)) return []
  const out = []
  for (const entry of readdirSync(abs, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    if (!exts.some((e) => entry.name.endsWith(e))) continue
    const absPath = join(entry.parentPath ?? entry.path, entry.name)
    const rel = relative(ROOT, absPath).split('\\').join('/')
    // 依赖与生成产物不是我们的代码，别把 zod 的 as any 算到我们头上
    if (rel.split('/').some((segment) => SKIP_DIRS.has(segment))) continue
    out.push(rel)
  }
  return out.sort()
}

/**
 * 去注释，但**保留换行**，这样行号仍然可用。
 * 被注释掉的写法（例如 haptics.ts 头部解释「以前各处手写 impactAsync」）
 * 不应该被算成违规。
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
}

const sourceCache = new Map()
function load(relPath) {
  if (!sourceCache.has(relPath)) {
    sourceCache.set(relPath, stripComments(readFileSync(join(ROOT, relPath), 'utf8')))
  }
  return sourceCache.get(relPath)
}

/**
 * 原文（不去注释）。
 *
 * ⚠️ 有些规则**必须**看原文：`@ts-ignore` / `@ts-expect-error` 本身就是注释，
 * 走 stripComments 会被整行抹掉，规则就永远不可能命中 —— 一个「永远为真」的
 * 检查比没有检查更危险，因为它会让人以为这件事已经被守住了。
 */
function loadRaw(relPath) {
  const key = `raw:${relPath}`
  if (!sourceCache.has(key)) {
    sourceCache.set(key, readFileSync(join(ROOT, relPath), 'utf8'))
  }
  return sourceCache.get(key)
}

/** 在一批文件里按正则统计命中，返回 Map<文件, 命中行[]> */
function collect(files, pattern, { raw = false } = {}) {
  const hits = new Map()
  for (const file of files) {
    const lines = (raw ? loadRaw(file) : load(file)).split('\n')
    const found = []
    lines.forEach((text, index) => {
      pattern.lastIndex = 0
      if (pattern.test(text)) found.push({ line: index + 1, text: text.trim() })
    })
    if (found.length) hits.set(file, found)
  }
  return hits
}

/** Map<文件, 命中行[]> → Map<文件, 数量> */
function toCounts(hits) {
  return new Map([...hits].map(([file, found]) => [file, found.length]))
}

// ─────────────────────────────────────────────────────────────────────────────
// 规则定义
// ─────────────────────────────────────────────────────────────────────────────

const MOBILE_CODE = () => walk(MOBILE_SRC, { exts: ['.ts', '.tsx'] })
const ALL_SOURCE = () => [
  ...MOBILE_CODE(),
  ...walk('apps/mobile/modules', { exts: ['.ts', '.tsx'] }),
  ...walk('packages', { exts: ['.ts', '.tsx'] }).filter((f) => f.includes('/src/')),
]

const RULES = [
  {
    id: 'haptics-centralized',
    title: '触感反馈必须走 src/lib/haptics.ts',
    why: [
      '各调用点手写 Haptics.* 必然漂移 —— 历史上就出现过「迷你播放条有反馈、',
      '全屏播放页没有」的不一致。加触感应该只有一处可写。',
      '如果现有 tap()/select() 表达不了你要的语义，**先扩展 haptics.ts**，',
      '而不是就地绕过它。',
    ].join('\n    '),
    ratchet: true,
    run() {
      const files = MOBILE_CODE().filter((f) => f !== HAPTICS_MODULE)
      return collect(files, /Haptics\.(impactAsync|notificationAsync|selectionAsync)\s*\(/)
    },
  },
  {
    id: 'policy-module-purity',
    title: '*policy.ts 必须是不依赖 RN / Expo 的纯逻辑',
    why: [
      'policy 模块的意义就是「能直接单测」—— 一旦 import 了 react-native / expo，',
      '测试就必须先搭一整套 mock，于是大家就不写了。',
      '需要持久化的状态请放 *-preferences.ts（那个可以有依赖，测试里 mock 掉）。',
    ].join('\n    '),
    ratchet: false,
    run() {
      const files = MOBILE_CODE().filter((f) => /-policy\.tsx?$/.test(f))
      const hits = new Map()
      const forbidden =
        /from\s+['"](react-native[^'"]*|expo[^'"]*|@expo\/[^'"]*|@\/(components|screens|player)\/[^'"]*|\.\.\/(components|screens|player)\/[^'"]*)['"]/
      for (const file of files) {
        const found = []
        load(file)
          .split('\n')
          .forEach((text, index) => {
            if (forbidden.test(text)) found.push({ line: index + 1, text: text.trim() })
          })
        if (found.length) hits.set(file, found)
      }
      return hits
    },
  },
  {
    id: 'no-console-log',
    title: 'src 下不允许 console.log',
    why: [
      'console.log 会随发布包一起出去，且在 RN 上开销不小。',
      '需要保留的日志用 console.warn / console.error（超时、降级这类要能上报的）。',
      `调试自检页（${CONSOLE_LOG_ALLOWLIST.join('、')}）已列入白名单。`,
    ].join('\n    '),
    ratchet: false,
    run() {
      const files = MOBILE_CODE().filter((f) => !CONSOLE_LOG_ALLOWLIST.includes(f))
      return collect(files, /\bconsole\.log\s*\(/)
    },
  },
  {
    id: 'colors-via-theme-tokens',
    title: '组件里不许出现十六进制颜色字面量（色值只能写在 theme/）',
    why: [
      '散落在组件里的 #rrggbb 就是「改不动」的根源：想统一调色时得全局搜索，',
      '而且深/浅色两套值很容易只改一边。色值只许写在 theme/tokens.ts，',
      '组件用 colors.<角色>。',
      `白名单（${HEX_LITERAL_ALLOWLIST.length} 个）：致命错误屏 —— 它刻意不依赖主题。`,
    ].join('\n    '),
    ratchet: false,
    run() {
      const files = MOBILE_CODE().filter(
        (f) => !f.startsWith(THEME_DIR) && !HEX_LITERAL_ALLOWLIST.includes(f),
      )
      return collect(files, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/)
    },
  },
  {
    id: 'accent-via-roles',
    title: '品牌色只走语义角色（组件里禁止直接用 colors.accent）',
    why: [
      'accent 以前同时表示「选中 / 正在播放 / 收藏 / 可点动作 / 导航高亮」，',
      '一屏出现三四处红就吵；而且它还和 danger / like 同值，改品牌色会连累它们。',
      '现在组件一律用角色：stateSelected（选中/激活）、playing、like、danger、',
      'primaryAction（每屏最多一处的主行动）、actionText / actionTextMuted / disabledText，',
      '以及装饰位的 brandTint。accent 只留给 theme/ 里的映射。',
    ].join('\n    '),
    ratchet: false,
    run() {
      const files = MOBILE_CODE().filter((f) => !f.startsWith(THEME_DIR))
      return collect(files, /\bcolors\.accent\b/)
    },
  },
  {
    id: 'no-ts-ignore',
    title: '禁止 @ts-ignore，需要压制错误就用 @ts-expect-error',
    why: [
      '@ts-ignore 在错误被修好之后仍然静默生效，属于「永远拆不掉的临时方案」；',
      '@ts-expect-error 在错误消失时会自己失败，逼着人回来删掉它。',
    ].join('\n    '),
    ratchet: false,
    run() {
      return collect(ALL_SOURCE(), /@ts-ignore/, { raw: true })
    },
  },
  {
    id: 'type-escape-hatches',
    title: '类型逃生舱（as any / as never / as unknown as）只减不增',
    why: [
      '这里不是要一次清零，而是**不让它继续长**。',
      '新增的 as never 请优先确认是不是「新路由没重新生成类型」——',
      `见 ${ROUTER_TYPES}，重新生成方法记在 MEMORY.md 里，不要用 as never 糊过去。`,
    ].join('\n    '),
    ratchet: true,
    run() {
      return collect(
        ALL_SOURCE(),
        /\bas\s+(any|never)\b|\bas\s+unknown\s+as\b/,
      )
    },
  },
  {
    id: 'routes-typed',
    title: '每个路由文件都必须出现在 .expo/types/router.d.ts 里',
    why: [
      '新增路由后 router.d.ts 不会自动更新，于是 router.push 报类型错，',
      '大家就用 as never 糊过去 —— 类型检查从此对这条路径失效。',
      '正确做法是按 MEMORY.md 里的方法离线重新生成类型。',
    ].join('\n    '),
    ratchet: false,
    run() {
      // router.d.ts 是 expo-router 的**生成产物**，且被 .gitignore 排除 ——
      // CI 上（干净 checkout）根本不存在。
      //
      // 所以这里必须**显式报告跳过**，绝不能静默返回空结果：一条「因为文件不在
      // 所以永远通过」的规则，正是本文件开头批评的那种失效模式，只是发生在检查器自己身上。
      if (!existsSync(join(ROOT, ROUTER_TYPES))) {
        return { skip: `${ROUTER_TYPES} 不存在（生成产物，未纳入版本库；本地跑一次 expo start 即可生成）` }
      }
      const types = readFileSync(join(ROOT, ROUTER_TYPES), 'utf8')
      const hits = new Map()
      for (const file of walk(`${MOBILE_SRC}/app`, { exts: ['.tsx', '.ts'] })) {
        const rel = file.slice(`${MOBILE_SRC}/app/`.length)
        const base = rel.split('/').pop() ?? ''
        // _layout / +not-found / +html 这些不是可导航路由
        if (base.startsWith('_') || base.startsWith('+')) continue

        const segments = rel
          .replace(/\.tsx?$/, '')
          .split('/')
          .filter((s) => !(s.startsWith('(') && s.endsWith(')'))) // 去掉 (tabs) 这类分组
        if (segments[segments.length - 1] === 'index') segments.pop()
        const routePath = `/${segments.join('/')}`

        if (!types.includes('`' + routePath + '`')) {
          hits.set(file, [{ line: 0, text: `路由 ${routePath} 不在 router.d.ts 里` }])
        }
      }
      return { hits }
    },
  },
  {
    id: 'file-size-budget',
    title: `单文件不得超过 ${MAX_FILE_LINES} 行`,
    why: [
      '超大文件 = 多个职责挤在一起：改一处要先读完一屏不相干逻辑，review 也看不动。',
      '拆分方式按文件类型：',
      '  · 屏幕/组件 → 抽子组件、把纯逻辑挪到 lib/*、把样式留在原处；',
      '  · 纯逻辑模块（controller / downloads 这类）→ 按领域拆成多个文件再 re-export。',
      '走棘轮：存量已记入基线，只许减少。新文件/现有文件变长超标即失败。',
    ].join('\n    '),
    ratchet: true,
    run() {
      const hits = new Map()
      for (const file of ALL_SOURCE()) {
        // 行数要看原文：去注释会把大段文档注释抹成空行，低估真实体量。
        const lineCount = loadRaw(file).split('\n').length
        if (lineCount > MAX_FILE_LINES) {
          hits.set(file, [{ line: 0, text: `${lineCount} 行（上限 ${MAX_FILE_LINES}）` }])
        }
      }
      return hits
    },
  },
  {
    id: 'components-per-file',
    title: `单个 .tsx 顶层组件不得超过 ${MAX_COMPONENTS_PER_FILE} 个`,
    why: [
      '一个文件里塞一堆组件，几乎必然是「本可以拆成多个文件」——',
      'player-queue.tsx 曾在一个文件里放了 7 个组件。',
      '把次要组件搬到同目录的独立文件，主组件 import 它们即可。',
      '只统计 .tsx（UI 文件）；纯逻辑 .ts 的多导出不在此列。',
      '走棘轮：存量已记入基线，只许减少。',
    ].join('\n    '),
    ratchet: true,
    run() {
      const hits = new Map()
      for (const file of ALL_SOURCE()) {
        if (!file.endsWith('.tsx')) continue
        const lines = load(file).split('\n')
        const components = []
        lines.forEach((text, index) => {
          if (COMPONENT_DEFINITION.test(text)) {
            components.push({ line: index + 1, text: text.trim().slice(0, 60) })
          }
        })
        if (components.length > MAX_COMPONENTS_PER_FILE) {
          hits.set(file, [
            { line: 0, text: `${components.length} 个顶层组件（上限 ${MAX_COMPONENTS_PER_FILE}）` },
          ])
        }
      }
      return hits
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 棘轮比对
// ─────────────────────────────────────────────────────────────────────────────

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return { rules: {} }
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  } catch (error) {
    console.error(c.red(`无法解析 ${relative(ROOT, BASELINE_PATH)}：${error.message}`))
    process.exit(1)
  }
}

function compare(counts, baselineForRule) {
  const added = []
  const reduced = []
  for (const [file, count] of counts) {
    const before = baselineForRule[file] ?? 0
    if (count > before) added.push({ file, count, before })
  }
  for (const [file, before] of Object.entries(baselineForRule)) {
    const now = counts.get(file) ?? 0
    if (now < before) reduced.push({ file, before, now })
  }
  return { added, reduced }
}

// ─────────────────────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const updateBaseline = args.includes('--update-baseline')
const strict = args.includes('--strict')
const baseline = loadBaseline()

const nextBaseline = { ...baseline, rules: { ...(baseline.rules ?? {}) } }
let failed = false
let totalAdded = 0
let totalDebt = 0
const suggestions = []

console.log(c.bold('\n架构守卫  ·  qingjian-music\n'))

for (const rule of RULES) {
  const result = rule.run()
  // 规则可以返回 Map<文件, 命中行[]>，也可以返回 { skip } / { hits }
  const hits = result instanceof Map ? result : (result.hits ?? new Map())
  const skip = result instanceof Map ? null : result.skip
  const counts = toCounts(hits)
  const debt = [...counts.values()].reduce((a, b) => a + b, 0)
  totalDebt += debt

  if (skip) {
    console.log(`${c.yellow('⚠')} ${rule.title}  ${c.yellow('已跳过')}`)
    console.log(c.dim(`    ${skip}`))
    console.log()
    continue
  }

  if (!rule.ratchet) {
    if (debt === 0) {
      console.log(`${c.green('✓')} ${rule.title}`)
      continue
    }
    failed = true
    console.log(`${c.red('✗')} ${rule.title}  ${c.red(`(${debt} 处)`)}`)
    console.log(c.dim(`    ${rule.why}`))
    for (const [file, found] of hits) {
      for (const hit of found) {
        const at = hit.line ? `${file}:${hit.line}` : file
        console.log(c.red(`      ${at}`) + (hit.line ? `  ${c.dim(hit.text)}` : `  ${c.dim(hit.text)}`))
      }
    }
    console.log()
    continue
  }

  // 棘轮规则
  const { added, reduced } = compare(counts, nextBaseline.rules[rule.id] ?? {})
  nextBaseline.rules[rule.id] = Object.fromEntries(
    [...counts].sort(([a], [b]) => a.localeCompare(b)),
  )

  if (added.length === 0 && (debt === 0 || !strict)) {
    const note = debt === 0 ? '' : c.dim(`  (存量 ${debt} 处，已记入基线)`)
    console.log(`${c.green('✓')} ${rule.title}${note}`)
  }
  if (added.length > 0) {
    failed = true
    totalAdded += added.length
    console.log(`${c.red('✗')} ${rule.title}  ${c.red(`新增 ${added.length} 个文件`)}`)
    console.log(c.dim(`    ${rule.why}`))
    for (const item of added) {
      console.log(
        c.red(`      ${item.file}`) +
          c.dim(`  ${item.before} → ${item.count}`),
      )
      for (const hit of hits.get(item.file) ?? []) {
        console.log(c.dim(`        :${hit.line}  ${hit.text}`))
      }
    }
    console.log()
  } else if (strict && debt > 0) {
    failed = true
    console.log(`${c.red('✗')} ${rule.title}  ${c.red(`(--strict) 存量 ${debt} 处`)}`)
    for (const [file, found] of hits) {
      console.log(c.yellow(`      ${file}`) + c.dim(`  ${found.length} 处`))
    }
    console.log()
  }

  if (reduced.length > 0) {
    suggestions.push(
      `${rule.id}: ${reduced.map((r) => `${r.file} ${r.before}→${r.now}`).join('、')}`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 结果
// ─────────────────────────────────────────────────────────────────────────────

if (updateBaseline) {
  nextBaseline.note =
    '架构守卫基线：由 `node scripts/guard-architecture.mjs --update-baseline` 生成。只允许下调。'
  writeFileSync(BASELINE_PATH, `${JSON.stringify(nextBaseline, null, 2)}\n`)
  console.log(c.green(`已写入基线 ${relative(ROOT, BASELINE_PATH)}`))
  process.exit(0)
}

if (suggestions.length > 0) {
  console.log(c.yellow('债务已减少，可以把基线降下来（跑 --update-baseline）：'))
  for (const s of suggestions) console.log(c.dim(`  ${s}`))
  console.log()
}

if (failed) {
  console.log(
    c.red(
      `守卫失败：新增违规 ${totalAdded} 处，另有硬规则违规。` +
        '\n修好之后重跑；如果确实是存量债务需要先记账，用 --update-baseline。\n',
    ),
  )
  process.exit(1)
}

console.log(c.green(`守卫通过。存量债务 ${totalDebt} 处，未新增。\n`))
