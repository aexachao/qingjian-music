#!/usr/bin/env node
/**
 * 一条命令跑完所有本地校验：架构守卫 → 文档事实守卫 → ESLint → 四个包的类型检查 → 四个包的单元测试。
 *
 * ── 为什么不用 `pnpm -r` ────────────────────────────────────────────────────
 * 在这台机器上 `pnpm -r typecheck` / `pnpm -r test` 会触发 pnpm 的依赖状态检查，
 * 报 `EEXIST symlink` 直接失败。结果就是「本地跑不了 → 大家干脆不跑」——
 * 校验一旦需要四段手打命令，就必然被跳过。
 *
 * 所以这里绕开 pnpm，直接调用**各包自带的** tsc / vitest / eslint 二进制：
 *   · 本地和 CI 跑的是同一条命令、同一份逻辑；
 *   · 不依赖 pnpm 的 workspace 解析，也就不会踩那个 symlink 坑。
 *
 * 用法：
 *   node scripts/verify.mjs                 # 全部
 *   node scripts/verify.mjs --only guard
 *   node scripts/verify.mjs --only docs
 *   node scripts/verify.mjs --only lint
 *   node scripts/verify.mjs --only typecheck
 *   node scripts/verify.mjs --only test
 *   node scripts/verify.mjs --skip-guard
 *
 * 完整验收（含 SwiftLint + iOS 编译）用 node scripts/verify-full.mjs；
 * 各步骤清单与计数见 docs/现状基线.md —— 不要在别处复述项数。
 *
 * 只想看某个文件的 lint 结果时，直接跑 eslint（不要用本脚本）：
 *   node node_modules/eslint/bin/eslint.js apps/mobile/src/screens/home.tsx
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const TYPE_TARGETS = [
  'packages/core-domain',
  'packages/provider-api',
  'packages/provider-fnos',
  'apps/mobile',
]

/** vitest 参数按包的实际布局给（provider-api 的测试在 test/ 根下） */
const TEST_TARGETS = [
  { dir: 'packages/core-domain', args: [] },
  { dir: 'packages/provider-api', args: [] },
  { dir: 'packages/provider-fnos', args: ['test/unit'] },
  { dir: 'apps/mobile', args: ['test/unit'] },
]

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

const argv = process.argv.slice(2)
const onlyIndex = argv.indexOf('--only')
const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : null
const skipGuard = argv.includes('--skip-guard')
const validOnlyValues = new Set(['guard', 'docs', 'lint', 'typecheck', 'test'])

if (onlyIndex >= 0 && (!only || only.startsWith('--') || !validOnlyValues.has(only))) {
  console.error(`--only 必须是以下值之一：${[...validOnlyValues].join(', ')}`)
  process.exit(2)
}
const consumedArgs = new Set(['--skip-guard'])
if (onlyIndex >= 0) {
  consumedArgs.add('--only')
  consumedArgs.add(only)
}
const unknownArgs = argv.filter((arg) => !consumedArgs.has(arg))
const expectedArgCount = (onlyIndex >= 0 ? 2 : 0) + (skipGuard ? 1 : 0)
if (unknownArgs.length > 0 || argv.length !== expectedArgCount) {
  console.error(`不支持或重复的参数：${argv.join(' ')}`)
  process.exit(2)
}
if (only === 'guard' && skipGuard) {
  console.error('--only guard 不能与 --skip-guard 同时使用')
  process.exit(2)
}

const results = []

function run(label, command, args, cwd) {
  process.stdout.write(`\n${c.bold(`▸ ${label}`)}\n`)
  const started = Date.now()
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  const ok = result.status === 0
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  results.push({ label, ok, seconds })
  if (!ok) {
    console.log(c.red(`✗ ${label} 失败（${seconds}s）`))
  }
  return ok
}

function missingBinary(dir, relPath) {
  const abs = join(ROOT, dir, relPath)
  if (existsSync(abs)) return null
  return `${dir}/${relPath} 不存在 —— 先在仓库根目录跑一次 pnpm install`
}

// ── 1. 架构守卫 ──────────────────────────────────────────────────────────────
if ((!only && !skipGuard) || only === 'guard') {
  run('架构守卫', process.execPath, [join(ROOT, 'scripts', 'guard-architecture.mjs')], ROOT)
}

// ── 2. 文档事实守卫 ──────────────────────────────────────────────────────────
// 放在 ESLint 前面：它只读 git 跟踪集与文件系统，不到 1 秒，文档错了没必要等 lint。
if ((!only && !skipGuard) || only === 'docs') {
  run('文档事实守卫', process.execPath, [join(ROOT, 'scripts', 'check-docs.mjs')], ROOT)
}

// ── 3. ESLint ────────────────────────────────────────────────────────────────
/**
 * 警告预算 —— **只能往下调**，和 scripts/guard-baseline.json 是同一个契约。
 *
 * 现存 94 条警告全部是「要改就得动交互时序、必须真机验证」的类型
 * （React Compiler 时代的 ref/immutability 规则 + exhaustive-deps），
 * 本机没有 Android SDK / iOS 真机环境，所以先不拿它们卡 CI，
 * 但**不允许再涨**。改小这个数字是唯一的正确方向。
 *
 * 新增警告 → CI 失败。修掉一些之后，请把这里的数字一并改小。
 */
const LINT_WARNING_BUDGET = 94

if (!only || only === 'lint') {
  const missing = missingBinary('.', 'node_modules/eslint/bin/eslint.js')
  if (missing) {
    results.push({ label: 'lint', ok: false, seconds: '0.0' })
    console.log(c.red(`✗ ${missing}`))
  } else {
    run(
      'lint · ESLint',
      process.execPath,
      [
        join(ROOT, 'node_modules/eslint/bin/eslint.js'),
        '.',
        '--max-warnings',
        String(LINT_WARNING_BUDGET),
      ],
      ROOT,
    )
  }
}

// ── 4. 类型检查 ──────────────────────────────────────────────────────────────
if (!only || only === 'typecheck') {
  for (const dir of TYPE_TARGETS) {
    const missing = missingBinary(dir, 'node_modules/typescript/bin/tsc')
    if (missing) {
      results.push({ label: `typecheck ${dir}`, ok: false, seconds: '0.0' })
      console.log(c.red(`✗ ${missing}`))
      continue
    }
    run(
      `typecheck · ${dir}`,
      process.execPath,
      [join(ROOT, dir, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
      join(ROOT, dir),
    )
  }
}

// ── 5. 单元测试 ──────────────────────────────────────────────────────────────
if (!only || only === 'test') {
  for (const target of TEST_TARGETS) {
    const missing = missingBinary(target.dir, 'node_modules/vitest/vitest.mjs')
    if (missing) {
      results.push({ label: `test ${target.dir}`, ok: false, seconds: '0.0' })
      console.log(c.red(`✗ ${missing}`))
      continue
    }
    run(
      `test · ${target.dir}`,
      process.execPath,
      [join(ROOT, target.dir, 'node_modules/vitest/vitest.mjs'), 'run', ...target.args],
      join(ROOT, target.dir),
    )
  }
}

// ── 汇总 ─────────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok)
console.log(`\n${c.bold('── 汇总 ──')}`)
for (const item of results) {
  const mark = item.ok ? c.green('✓') : c.red('✗')
  console.log(`${mark} ${item.label}  ${c.dim(`${item.seconds}s`)}`)
}

if (failed.length > 0) {
  console.log(c.red(`\n${failed.length} 项失败。\n`))
  process.exit(1)
}
console.log(c.green(`\n全部通过（${results.length} 项）。\n`))
