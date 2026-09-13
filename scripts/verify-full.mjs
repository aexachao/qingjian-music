#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

function run(script) {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) {
    console.error(`${script} 无法启动：${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (process.argv.length > 2) {
  console.error(`完整验证不支持参数：${process.argv.slice(2).join(' ')}`)
  process.exit(2)
}
if (process.platform !== 'darwin') {
  console.error('完整验证包含 iOS 编译，必须在安装了 Xcode 的 macOS 上运行。')
  process.exit(1)
}

run('verify.mjs')
run('verify-ios.mjs')
// 不打印具体项数：每加一个校验步骤这个数字都会过期，而它恰好是最容易被复述出去的
// 那种数字。清单与计数见 docs/现状基线.md，由 scripts/check-docs.mjs 机械校验。
console.log('\n✓ 完整验证通过：全部 JS/TS 校验 + SwiftLint 0 warning + iOS Release 编译与产物校验')
