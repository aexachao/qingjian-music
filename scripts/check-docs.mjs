#!/usr/bin/env node
/**
 * 文档事实守卫 —— 把「文档里写的事实」变成可执行检查。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * 这个仓库的文档曾经同时存在多套互相矛盾的说法：交接文档写「4 个自定义 Expo
 * Module」（实际 3）、技术评审写「test/unit 43 个文件」（实际 46）、CI 文档写
 * 「两个 job」（实际 3）、`verify.mjs` 的项数在不同文档里分别写作 9 和 10。
 * 更危险的一种：受版本管理的 README / CONTRIBUTING / build-and-ci 让人去跑
 * `scripts/verify-full.mjs`，而那个文件当时**根本没提交** —— 本地存在，干净检
 * 出和 CI 里不存在。
 *
 * 这些问题的共同点是「不报错、不崩溃，只是悄悄失真」，和 guard-architecture
 * 要防的是同一类。所以用同样的手法固化成检查。
 *
 * ── 核心纪律 ────────────────────────────────────────────────────────────────
 * **每条事实都有一个 derive()，它只允许读三类来源**：
 *   ① `git ls-files`（跟踪集 —— 判断「公开可达」的唯一判据）
 *   ② 文件系统 / package.json · app.json / workflow YAML
 *   ③ 代码里被显式标注的常量（如 verify.mjs 的 LINT_WARNING_BUDGET）
 * **derive() 永不读任何 .md。** 文档只出现在断言侧，这样「文档说 X、守卫也从
 * 文档读 X」在结构上不可能发生。
 *
 * `fs.existsSync` 单独使用是不够的：未提交的文件在本地存在、在干净检出里不在。
 * 凡是「这个东西能不能被 clone 到的人看到」的问题，一律以跟踪集为准。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   node scripts/check-docs.mjs              # 检查，发现漂移即失败
 *   node scripts/check-docs.mjs --update     # 重写 docs/现状基线.md 的生成块
 *   node scripts/check-docs.mjs --self-test  # 自检：确认每条规则真的会失败
 *
 * 退出码：0 通过 / 1 漂移 / 2 参数错。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const BASELINE_DOC = join(ROOT, 'docs', '现状基线.md')
const BASELINE_REL = 'docs/现状基线.md'
const GENERATED_BEGIN = '<!-- BEGIN GENERATED'
const GENERATED_END = '<!-- END GENERATED -->'

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

// ── 参数 ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const KNOWN_ARGS = new Set(['--update', '--self-test'])
const unknown = argv.filter((a) => !KNOWN_ARGS.has(a))
if (unknown.length > 0 || new Set(argv).size !== argv.length) {
  console.error(`不支持或重复的参数：${unknown.join(' ') || argv.join(' ')}`)
  console.error(`可用参数：${[...KNOWN_ARGS].join('、')}`)
  process.exit(2)
}
const doUpdate = argv.includes('--update')
const doSelfTest = argv.includes('--self-test')

// ── 事实来源（永不读 .md）────────────────────────────────────────────────────

/** 跟踪集：判断「公开可达」的唯一判据 */
const TRACKED = (() => {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
  } catch {
    console.error('无法执行 git ls-files —— 本守卫依赖 git 跟踪集，请在仓库内运行。')
    process.exit(2)
  }
})()
const TRACKED_SET = new Set(TRACKED)

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
const readText = (rel) => readFileSync(join(ROOT, rel), 'utf8')

/** 列出某目录下的一级子目录名（只看跟踪集，避免把本地残留算进来） */
function trackedDirsUnder(prefix) {
  const out = new Set()
  for (const f of TRACKED) {
    if (!f.startsWith(prefix)) continue
    const rest = f.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash > 0) out.add(rest.slice(0, slash))
  }
  return [...out].sort()
}

/** 解析某个 workflow 文件里的 job id（纯文本解析，不引 YAML 依赖） */
function workflowJobs(rel) {
  if (!TRACKED_SET.has(rel)) return []
  const block = readText(rel).split(/^jobs:\s*$/m)[1]
  if (!block) return []
  const jobs = []
  for (const line of block.split('\n')) {
    if (/^\S/.test(line) && line.trim()) break
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (m) jobs.push(m[1])
  }
  return jobs.sort()
}

/**
 * 生成物与约定目录的**显式豁免**。
 *
 * 文档可以引用它们来描述「这是个生成文件」这类陷阱，即便它们按设计不随仓库发布
 * —— 但**每加一条都必须写清为什么它是生成物**，否则这个集合会退化成「让检查闭嘴」
 * 的口袋名单，那正是本守卫要防的东西。
 */
const GENERATED_PATHS = new Set([
  // expo-router 生成的路由类型：`.expo/` 整个目录被 .gitignore 排除，且会被 Expo
  // 工具清空。docs/build-and-ci.md 专门用一节解释「干净检出为什么跑不了类型检查」
  'apps/mobile/.expo/types/router.d.ts',
])

// ── 文档集合 ─────────────────────────────────────────────────────────────────

/** 带日期后缀的文档 = 时点快照 */
const SNAPSHOT_RE = /-20\d\d-\d\d-\d\d\.md$/
const trackedMd = TRACKED.filter((f) => f.endsWith('.md'))
const liveDocs = trackedMd.filter((f) => !SNAPSHOT_RE.test(f))
const snapshotDocs = trackedMd.filter((f) => SNAPSHOT_RE.test(f))

// ── 事实定义（derive 只读 git / fs / 代码常量）───────────────────────────────

const FACTS = [
  {
    id: 'expo-modules',
    label: '自定义 Expo Module',
    derive: () =>
      trackedDirsUnder('apps/mobile/modules/').filter((d) =>
        TRACKED_SET.has(`apps/mobile/modules/${d}/expo-module.config.json`),
      ),
    render: (v) => String(v.length),
    detail: (v) => v.join('、'),
  },
  {
    id: 'workspace-packages',
    label: '工作区包',
    derive: () =>
      ['packages', 'apps']
        .flatMap((p) => trackedDirsUnder(`${p}/`).map((d) => `${p}/${d}/package.json`))
        .filter((p) => TRACKED_SET.has(p))
        .map((p) => readJson(p).name)
        .sort(),
    render: (v) => String(v.length),
    detail: (v) => v.join('、'),
  },
  {
    id: 'guard-rules',
    label: '架构守卫规则',
    derive: () => (readText('scripts/guard-architecture.mjs').match(/^\s+id: '/gm) ?? []).length,
    render: (v) => String(v),
    detail: () => '`scripts/guard-architecture.mjs`',
  },
  {
    id: 'ci-jobs',
    label: 'CI job（ci.yml）',
    derive: () => workflowJobs('.github/workflows/ci.yml'),
    render: (v) => String(v.length),
    detail: (v) => v.join('、'),
  },
  {
    id: 'build-jobs',
    label: '出包 job（build.yml）',
    derive: () => workflowJobs('.github/workflows/build.yml'),
    render: (v) => String(v.length),
    detail: (v) => v.join('、'),
  },
  {
    id: 'lint-budget',
    label: 'ESLint 警告预算',
    derive: () => {
      const m = /const LINT_WARNING_BUDGET = (\d+)/.exec(readText('scripts/verify.mjs'))
      return m ? Number(m[1]) : null
    },
    render: (v) => (v === null ? '（未找到）' : String(v)),
    detail: () => '`scripts/verify.mjs` 的 `LINT_WARNING_BUDGET`，**只减不增**',
  },
  {
    id: 'node-engines',
    label: 'Node',
    derive: () => readJson('package.json').engines?.node ?? null,
    render: (v) => v ?? '（未声明）',
    detail: () => '`package.json` 的 `engines`',
  },
  {
    id: 'pnpm',
    label: 'pnpm',
    derive: () => (readJson('package.json').packageManager ?? '').replace(/^pnpm@/, '') || null,
    render: (v) => v ?? '（未声明）',
    detail: () => '`packageManager`',
  },
  {
    id: 'expo',
    label: 'Expo SDK',
    derive: () => readJson('apps/mobile/package.json').dependencies.expo.replace(/^[~^]/, ''),
    render: (v) => v,
    detail: () => '`apps/mobile`',
  },
  {
    id: 'react-native',
    label: 'React Native',
    derive: () => readJson('apps/mobile/package.json').dependencies['react-native'],
    render: (v) => v,
    detail: () => '`apps/mobile`',
  },
  {
    id: 'react',
    label: 'React',
    derive: () => readJson('apps/mobile/package.json').dependencies.react,
    render: (v) => v,
    detail: () => '`apps/mobile`',
  },
  {
    id: 'app-version',
    label: 'App 版本',
    derive: () => readJson('apps/mobile/app.json').expo.version,
    render: (v) => v,
    detail: () => '`apps/mobile/app.json`',
  },
]

function resolveFacts() {
  return FACTS.map((f) => {
    let value
    try {
      value = f.derive()
    } catch (e) {
      value = null
      f.error = e.message
    }
    return { fact: f, value }
  })
}

function renderBlock(rows) {
  const lines = [
    `${GENERATED_BEGIN}：由 node scripts/check-docs.mjs --update 生成，请勿手改 -->`,
    '| 事实 | 值 | 明细 |',
    '| --- | --- | --- |',
  ]
  for (const { fact, value } of rows) {
    lines.push(`| ${fact.label} | ${fact.render(value)} | ${fact.detail(value)} |`)
  }
  lines.push(GENERATED_END)
  return lines.join('\n')
}

function extractBlock(text) {
  const start = text.indexOf(GENERATED_BEGIN)
  const end = text.indexOf(GENERATED_END)
  if (start < 0 || end < 0 || end < start) return null
  return text.slice(start, end + GENERATED_END.length)
}

// ── 检查项 ───────────────────────────────────────────────────────────────────

const failures = []
const skips = []
const passes = []
const record = (docRel, line, detail) => failures.push({ docRel, line, detail })
const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** 相对链接 / 图片：解析到仓库内且不越出仓库根 */
function collectRefs(file, text) {
  const out = []
  const push = (target, index) => {
    const t = target.trim()
    if (!t || t.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(t)) return // http/mailto/data…
    out.push({ target: t, line: lineOf(text, index) })
  }
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) push(m[1], m.index)
  for (const m of text.matchAll(/\b(?:src|href)="([^"]+)"/g)) push(m[1], m.index)
  return out
}

function checkRefs() {
  const problems = []
  let counted = 0
  for (const docRel of liveDocs) {
    const text = readText(docRel)
    for (const { target, line } of collectRefs(docRel, text)) {
      const abs = resolve(ROOT, dirname(docRel), target.split('#')[0])
      if (!abs.startsWith(ROOT + sep)) continue // 指向仓库外：GitHub 相对链接（如 ../../releases）
      const rel = relative(ROOT, abs).split(sep).join('/')
      if (!rel) continue
      counted += 1
      // 链接可以指向目录（如 `[文档](docs/)`）：目录本身不在 git ls-files 里，
      // 但只要有文件在它下面，它在干净检出里就是存在的。
      const reachable = TRACKED_SET.has(rel) || TRACKED.some((f) => f.startsWith(`${rel}/`))
      if (!existsSync(abs)) {
        problems.push({ docRel, line, detail: `${target} —— 不存在于仓库` })
      } else if (!reachable) {
        problems.push({
          docRel,
          line,
          detail: `${target} —— 本地存在但**未纳入版本库**：干净检出与 CI 里没有它，别人 clone 下来会 404`,
        })
      }
    }
  }
  return { counted, problems }
}

/**
 * 反引号里的仓库路径。严格限定前缀与扩展名，避免把普通词组误判成路径。
 */
const CODE_PATH_RE = /`((?:apps|packages|scripts|docs|patches|assets|\.github)\/[^`\s]+?)`/g
const CODE_PATH_EXT = /\.(?:mjs|cjs|js|ts|tsx|json|ya?ml|md|patch|swift|sh|kt|txt)$/

function checkCodePaths() {
  const problems = []
  let counted = 0
  for (const docRel of liveDocs) {
    const text = readText(docRel)
    for (const m of text.matchAll(CODE_PATH_RE)) {
      const raw = m[1].replace(/[.,;:）)]+$/, '').replace(/\/+$/, '')
      const isDir = m[1].endsWith('/')
      if (!isDir && !CODE_PATH_EXT.test(raw)) continue
      if (raw.includes('*')) continue // 通配写法（如 patches/*.patch）不做展开
      if (GENERATED_PATHS.has(raw)) continue // 显式豁免的生成物
      counted += 1
      const tracked = TRACKED_SET.has(raw) || TRACKED.some((f) => f.startsWith(`${raw}/`))
      if (tracked) continue
      problems.push({
        docRel,
        line: lineOf(text, m.index),
        detail: existsSync(join(ROOT, raw))
          ? `\`${raw}\` —— 本地存在但**未纳入版本库**：干净检出与 CI 里没有它`
          : `\`${raw}\` —— 不存在于仓库`,
      })
    }
  }
  return { counted, problems }
}

/** docs/README.md 的索引必须覆盖全部受管理的 docs/*.md */
function checkIndex() {
  const indexRel = 'docs/README.md'
  if (!TRACKED_SET.has(indexRel)) return { skipped: 'docs/README.md 不在跟踪集里' }
  const text = readText(indexRel)
  // 文件名可能含中文（如 `现状基线.md`），所以字符类要放开，不能只写 [A-Za-z0-9._-]
  const linked = new Set(
    [...text.matchAll(/\]\(\.\/([^)\s]+\.md)\)/g)].map((m) => `docs/${m[1]}`),
  )
  const expected = trackedMd.filter((f) => f.startsWith('docs/') && f !== indexRel)
  const problems = []
  for (const f of expected) {
    if (!linked.has(f)) problems.push({ docRel: indexRel, line: 0, detail: `索引缺少 \`${f}\`` })
  }
  for (const f of linked) {
    if (!TRACKED_SET.has(f)) problems.push({ docRel: indexRel, line: 0, detail: `索引指向不存在的 \`${f}\`` })
  }
  return { counted: expected.length, problems }
}

/** 现状基线里的文档地图必须恰好划分全部受管理的 md */
const ROLE_TABLE_RE = /^\|\s*`([^`]+\.md)`\s*\|[^|]*\|\s*$/gm

function checkPartition() {
  if (!TRACKED_SET.has(BASELINE_REL)) {
    return { problems: [{ docRel: BASELINE_REL, line: 0, detail: '现状基线尚未纳入版本库' }] }
  }
  const text = readText(BASELINE_REL)
  const mapped = new Set([...text.matchAll(ROLE_TABLE_RE)].map((m) => m[1]))
  const problems = []
  for (const f of trackedMd) {
    if (!mapped.has(f)) {
      problems.push({
        docRel: BASELINE_REL,
        line: 0,
        detail: `\`${f}\` 未在「文档地图」里登记角色 —— 新文档必须归类，否则会逃出守卫范围`,
      })
    }
  }
  for (const f of mapped) {
    if (!TRACKED_SET.has(f)) {
      problems.push({ docRel: BASELINE_REL, line: 0, detail: `文档地图里的 \`${f}\` 不在跟踪集里` })
    }
  }
  return { counted: mapped.size, problems }
}

function checkSnapshotBanners() {
  if (snapshotDocs.length === 0) {
    return { skipped: `没有受版本管理的日期快照文档（本地另有 12 篇带日期的内部文档，按 .gitignore 有意不发布）` }
  }
  const problems = []
  for (const f of snapshotDocs) {
    const text = readText(f)
    if (!/时点快照/.test(text)) {
      problems.push({ docRel: f, line: 0, detail: '缺少「时点快照」标注' })
    }
  }
  return { counted: snapshotDocs.length, problems }
}

function checkFacts(rows) {
  const actual = renderBlock(rows)
  if (!existsSync(BASELINE_DOC)) {
    return { problems: [{ docRel: BASELINE_REL, line: 0, detail: '不存在 —— 跑 --update 生成' }], actual }
  }
  const text = readText(BASELINE_REL)
  const existing = extractBlock(text)
  if (existing === null) {
    return {
      problems: [{ docRel: BASELINE_REL, line: 0, detail: '找不到生成块标记（BEGIN GENERATED / END GENERATED）' }],
      actual,
    }
  }
  if (existing === actual) return { counted: rows.length, problems: [], actual }

  // 逐行定位差异，报错要能直接指到出问题的那一行
  const a = existing.split('\n')
  const b = actual.split('\n')
  const problems = []
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    if (a[i] === b[i]) continue
    problems.push({
      docRel: BASELINE_REL,
      line: lineOf(text, text.indexOf(existing)) + i,
      detail: `生成块不一致\n      文档：${a[i] ?? '（缺行）'}\n      实际：${b[i] ?? '（不该有这行）'}`,
    })
  }
  return { problems, actual }
}

// ── 执行 ─────────────────────────────────────────────────────────────────────

const rows = resolveFacts()

for (const { fact, error } of rows) {
  if (error) record(BASELINE_REL, 0, `事实 \`${fact.id}\` 推导失败：${error}`)
}

const refs = checkRefs()
const codePaths = checkCodePaths()
const index = checkIndex()
const partition = checkPartition()
const snapshot = checkSnapshotBanners()
const facts = checkFacts(rows)

function report(title, result, okText) {
  const problems = result.problems ?? []
  if (result.skipped) {
    skips.push(`${title}  ${c.yellow('已跳过')}  ${c.dim(result.skipped)}`)
    return
  }
  if (problems.length === 0) {
    passes.push(`${title}${okText ? c.dim(`  ${okText}`) : ''}`)
    return
  }
  failures.push(...problems)
  passes.push(null) // 占位，保持顺序
}

report('文档引用可解析且已纳入版本库', refs, `（${refs.counted} 处）`)
report('反引号里的仓库路径存在且已纳入版本库', codePaths, `（${codePaths.counted} 处）`)
report('文档索引完整', index, `（${index.counted} 篇）`)
report('文档地图恰好划分全部受管理的 md', partition, `（${partition.counted} 篇）`)
report('时点快照标注', snapshot)
report('现状基线生成块与实际一致', facts, `（${facts.counted ?? 0} 条事实）`)

// ── --self-test：确认每条规则真的会失败 ────────────────────────────────────
// 仓库的既有纪律是「新增规则必须先造一个违规样本验证它会失败」——这里把它机械化：
// 逐条事实注入假值，断言生成块确实随之变化；不变化说明该事实根本没进基线，规则形同虚设。

if (doSelfTest) {
  console.log(c.bold('自检：逐条事实注入假值，确认生成块会变化'))
  let bad = 0
  for (const row of rows) {
    const mutated = { ...row, value: Array.isArray(row.value) ? [...row.value, '注入的假值'] : `${row.value ?? ''}X` }
    const mutatedRows = rows.map((r) => (r.fact.id === row.fact.id ? mutated : r))
    const changed = renderBlock(mutatedRows) !== renderBlock(rows)
    if (changed) {
      console.log(`${c.green('✓')} ${row.fact.id}  ${c.dim('注入假值后生成块确实不同')}`)
    } else {
      bad += 1
      console.log(`${c.red('✗')} ${row.fact.id}  ${c.red('注入假值后生成块不变 —— 该事实没有真正进入基线，规则形同虚设')}`)
    }
  }
  console.log()
  if (bad > 0) {
    console.log(c.red(`自检失败：${bad} 条事实是空规则。\n`))
    process.exit(1)
  }
  console.log(c.green('自检通过：每条事实都会真实影响生成块。\n'))
}

// ── --update：本脚本唯一会写文件的分支 ─────────────────────────────────────

if (doUpdate) {
  if (!existsSync(BASELINE_DOC)) {
    console.error(`${BASELINE_REL} 不存在，无法就地更新。`)
    process.exit(2)
  }
  const text = readText(BASELINE_REL)
  const existing = extractBlock(text)
  if (existing === null) {
    console.error(`${BASELINE_REL} 里找不到生成块标记。`)
    process.exit(2)
  }
  // 用函数式替换：字符串替换会解释 `$&` / `$1` 等模式，事实值里一旦出现 `$`
  // 就会静默改坏文档（这类「不报错、只是悄悄不对」正是本仓库最想消灭的形态）。
  writeFileSync(BASELINE_DOC, text.replace(existing, () => facts.actual))
  console.log(c.green(`已重写 ${BASELINE_REL} 的事实生成块。`))
  process.exit(0)
}

// ── 结果 ─────────────────────────────────────────────────────────────────────

// 同一个路径可能同时被「引用检查」和「反引号路径检查」命中，按 (文档, 明细) 去重
const uniqueFailures = []
const seenFailure = new Set()
for (const f of failures) {
  const key = `${f.docRel} ${f.detail}`
  if (seenFailure.has(key)) continue
  seenFailure.add(key)
  uniqueFailures.push(f)
}

console.log(c.bold('文档事实守卫'))
console.log()
for (const line of passes) if (line) console.log(`${c.green('✓')} ${line}`)
for (const line of skips) console.log(`  ${line}`)

if (uniqueFailures.length > 0) {
  console.log()
  const byDoc = new Map()
  for (const f of uniqueFailures) {
    if (!byDoc.has(f.docRel)) byDoc.set(f.docRel, [])
    byDoc.get(f.docRel).push(f)
  }
  for (const [docRel, items] of byDoc) {
    console.log(c.red(`✗ ${docRel}`))
    for (const it of items) console.log(c.dim(`    ${it.line > 0 ? `${it.line}: ` : ''}${it.detail}`))
  }
  console.log()
  console.log(
    c.red(
      `文档事实守卫失败：${uniqueFailures.length} 处漂移。\n` +
        `引用类问题请改文档；计数类问题请跑 node scripts/check-docs.mjs --update。\n`,
    ),
  )
  process.exit(1)
}

console.log()
console.log(c.green('文档事实守卫通过。\n'))
