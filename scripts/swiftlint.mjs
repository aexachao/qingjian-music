#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const VERSION = '0.65.1'
const ARCHIVE_SHA256 = 'c1e429b0599cf1b516f369a2d9ec04eaf0e436f3c12b637df8851fa52ff694d0'
const BINARY_SHA256 = '52112ece2dfa99c2442a1367f9a365d43784714cf224c3675bf8bc2f18ebd7c8'
const CACHE_DIR = join(ROOT, '.cache', 'swiftlint', VERSION)
const ARCHIVE_PATH = join(CACHE_DIR, 'portable_swiftlint.zip')
const BINARY_PATH = join(CACHE_DIR, 'swiftlint')
const CONFIG_PATH = join(ROOT, '.swiftlint.yml')
const DOWNLOAD_URL = `https://github.com/realm/SwiftLint/releases/download/${VERSION}/portable_swiftlint.zip`
const SOURCE_PATHS = [ROOT]

function fail(message) {
  console.error(`SwiftLint 校验失败：${message}`)
  process.exit(1)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' })
  if (result.error) fail(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

async function installPinnedSwiftLint() {
  if (existsSync(BINARY_PATH) && sha256(BINARY_PATH) === BINARY_SHA256) return

  console.log(`下载 SwiftLint ${VERSION}（官方固定版本）...`)
  const response = await fetch(DOWNLOAD_URL)
  if (!response.ok) fail(`下载失败：HTTP ${response.status}`)

  const archive = new Uint8Array(await response.arrayBuffer())
  const digest = createHash('sha256').update(archive).digest('hex')
  if (digest !== ARCHIVE_SHA256) {
    fail(`压缩包 SHA-256 不匹配：期望 ${ARCHIVE_SHA256}，实际 ${digest}`)
  }

  mkdirSync(dirname(ARCHIVE_PATH), { recursive: true })
  writeFileSync(ARCHIVE_PATH, archive)
  run('/usr/bin/ditto', ['-x', '-k', ARCHIVE_PATH, CACHE_DIR])
  chmodSync(BINARY_PATH, 0o755)

  const binaryDigest = sha256(BINARY_PATH)
  if (binaryDigest !== BINARY_SHA256) {
    fail(`可执行文件 SHA-256 不匹配：期望 ${BINARY_SHA256}，实际 ${binaryDigest}`)
  }
}

if (process.platform !== 'darwin') fail('SwiftLint 只在 macOS / iOS 验证任务中运行')
if (process.argv.length > 2) fail(`不支持参数：${process.argv.slice(2).join(' ')}`)
if (!existsSync(CONFIG_PATH)) fail(`缺少配置文件 ${CONFIG_PATH}`)
for (const sourcePath of SOURCE_PATHS) {
  if (!existsSync(sourcePath)) fail(`Swift 源码目录不存在：${sourcePath}`)
}

await installPinnedSwiftLint()
console.log(`SwiftLint ${VERSION} 严格检查（warning 也会失败）`)
run(BINARY_PATH, ['lint', '--strict', '--config', CONFIG_PATH, ...SOURCE_PATHS])
