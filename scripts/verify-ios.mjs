#!/usr/bin/env node

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const MOBILE = join(ROOT, 'apps', 'mobile')
const IOS_DIR = join(MOBILE, 'ios')
const WORKSPACE = join(IOS_DIR, 'app.xcworkspace')
const EXPO_CLI = join(MOBILE, 'node_modules', 'expo', 'bin', 'cli')
const CACHE_DIR = join(ROOT, '.cache', 'ios-verify')
const DERIVED_DATA = resolve(process.env.QJ_IOS_DERIVED_DATA ?? join(CACHE_DIR, 'DerivedData'))
const BUILD_LOG = resolve(process.env.QJ_IOS_BUILD_LOG ?? join(CACHE_DIR, 'xcodebuild.log'))
const inheritedPath = (process.env.PATH ?? '')
  .split(':')
  .filter((entry) => entry && !entry.includes('WorkBuddy AI.app') && !entry.includes('brokered-bin'))

const childEnv = {
  ...process.env,
  CI: '1',
  LANG: process.env.LANG || 'en_US.UTF-8',
  LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
  // 原生工具会调用 rm/sed/grep 等系统命令。不要继承 IDE 注入的 brokered-bin，
  // 否则 CocoaPods 的 configure 探针会被安全代理拦截，得到与真实终端不同的假失败。
  PATH: [...new Set([
    dirname(process.execPath),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...inheritedPath,
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ])].join(':'),
}
// Xcode 的脚本阶段会继承 NODE_OPTIONS。IDE 注入的 Node shim 会拦截 CocoaPods / Hermes
// 对生成目录的正常清理，导致“业务代码没错但构建假失败”，所以原生构建用干净 Node 环境。
delete childEnv.NODE_OPTIONS
for (const key of Object.keys(childEnv)) {
  if (key.startsWith('CODEBUDDY_') || key.startsWith('WORKBUDDY_') || key.startsWith('TOYBOX_')) {
    delete childEnv[key]
  }
}

function fail(message) {
  console.error(`iOS 验证失败：${message}`)
  process.exit(1)
}

function run(label, command, args, cwd = ROOT) {
  console.log(`\n▸ ${label}`)
  const result = spawnSync(command, args, { cwd, env: childEnv, stdio: 'inherit' })
  if (result.error) fail(`${label} 无法启动：${result.error.message}`)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function runExpoPrebuild() {
  console.log('\n▸ 重新生成 iOS 原生工程')
  const result = spawnSync(
    process.execPath,
    [EXPO_CLI, 'prebuild', '--platform', 'ios', '--clean', '--no-install'],
    { cwd: MOBILE, env: childEnv, stdio: 'inherit' },
  )
  if (result.error) fail(`Expo prebuild 无法启动：${result.error.message}`)
  if (result.status !== 0) process.exit(result.status ?? 1)

  console.log('\n▸ 安装 CocoaPods 依赖')
  const podResult = spawnSync('pod', ['install', '--no-repo-update'], {
    cwd: IOS_DIR,
    env: childEnv,
    stdio: 'inherit',
  })
  if (podResult.error) fail(`pod install 无法启动：${podResult.error.message}`)
  if (podResult.status !== 0) process.exit(podResult.status ?? 1)
}

function runCaptured(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, env: childEnv, encoding: 'utf8' })
  if (result.error) fail(result.error.message)
  if (result.status !== 0) fail(`${command} 执行失败：${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

function tail(text, count) {
  return text.split('\n').slice(-count).join('\n')
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function buildIos() {
  console.log('\n▸ iOS Release 设备版编译（不签名）')
  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(DERIVED_DATA, { recursive: true })
  const logFd = openSync(BUILD_LOG, 'w')
  const result = spawnSync(
    '/usr/bin/xcrun',
    [
      'xcodebuild',
      '-workspace',
      WORKSPACE,
      '-scheme',
      'app',
      '-configuration',
      'Release',
      '-sdk',
      'iphoneos',
      '-destination',
      'generic/platform=iOS',
      '-derivedDataPath',
      DERIVED_DATA,
      'CODE_SIGNING_ALLOWED=NO',
      'CODE_SIGNING_REQUIRED=NO',
      'CODE_SIGN_IDENTITY=',
      'clean',
      'build',
    ],
    { cwd: MOBILE, env: childEnv, stdio: ['ignore', logFd, logFd] },
  )
  closeSync(logFd)

  if (result.error) fail(`xcodebuild 无法启动：${result.error.message}`)
  if (result.status !== 0) {
    const log = readFileSync(BUILD_LOG, 'utf8')
    const summary = log
      .split('\n')
      .filter((line) => /error:|BUILD FAILED|The following build commands failed|No profiles for|PhaseScriptExecution failed/i.test(line))
      .slice(0, 80)
      .join('\n')
    console.error(summary || '未找到结构化错误摘要')
    console.error(`\n── 日志末尾 140 行 ──\n${tail(log, 140)}`)
    console.error(`\n完整日志：${BUILD_LOG}`)
    process.exit(result.status ?? 1)
  }

  console.log(`iOS 编译成功；完整日志：${BUILD_LOG}`)
}

function verifyProduct() {
  console.log('\n▸ 校验 iOS 构建产物')
  const productsDir = join(DERIVED_DATA, 'Build', 'Products', 'Release-iphoneos')
  if (!existsSync(productsDir)) fail(`产物目录不存在：${productsDir}`)
  const appName = readdirSync(productsDir).find((name) => name.endsWith('.app'))
  if (!appName) fail(`在 ${productsDir} 下没有找到 .app`)
  const appPath = join(productsDir, appName)

  const bundlePath = join(appPath, 'main.jsbundle')
  if (!existsSync(bundlePath) || !statSync(bundlePath).isFile() || statSync(bundlePath).size === 0) {
    fail('产物缺少有效的 main.jsbundle，安装后会白屏')
  }
  if (existsSync(join(appPath, 'embedded.mobileprovision'))) {
    fail('产物包含 embedded.mobileprovision，说明无签名构建没有生效')
  }

  const plist = join(appPath, 'Info.plist')
  const executableName = runCaptured('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plist])
  const builtVersion = runCaptured('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist])
  const builtBundleId = runCaptured('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist])
  const appConfig = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo
  const expectedVersion = appConfig.version
  const expectedBundleId = appConfig.ios?.bundleIdentifier
  if (builtVersion !== expectedVersion) {
    fail(`产物版本不一致：app.json=${expectedVersion}，Info.plist=${builtVersion}`)
  }
  if (!expectedBundleId || builtBundleId !== expectedBundleId) {
    fail(`产物 Bundle ID 不一致：app.json=${expectedBundleId}，Info.plist=${builtBundleId}`)
  }

  const executable = join(appPath, executableName)
  if (!existsSync(executable) || !statSync(executable).isFile() || statSync(executable).size === 0) {
    fail(`主二进制不存在或为空：${executable}`)
  }
  const buildInfo = runCaptured('/usr/bin/xcrun', ['vtool', '-show-build', executable])
  if (!/platform\s+IOS(?:\s|$)/.test(buildInfo)) {
    fail(`产物不是 iOS 设备版：\n${buildInfo}`)
  }
  const architectures = runCaptured('/usr/bin/lipo', ['-archs', executable]).split(/\s+/)
  if (!architectures.includes('arm64')) fail(`产物缺少 arm64：${architectures.join(', ')}`)

  console.log(`产物：${appPath}`)
  console.log(`版本：${builtVersion}`)
  console.log(`Bundle ID：${builtBundleId}`)
  console.log(`架构：${architectures.join(', ')}`)
  console.log('main.jsbundle：存在')
  console.log('平台：IOS 设备版')
  console.log('签名描述文件：无')
}

if (process.platform !== 'darwin') fail('必须在安装了 Xcode 的 macOS 上运行')
if (process.argv.length > 2) fail(`不支持参数：${process.argv.slice(2).join(' ')}`)
if (!existsSync(EXPO_CLI)) fail('找不到 Expo CLI，请先在仓库根目录安装依赖')
runCaptured('/usr/bin/xcrun', ['xcodebuild', '-version'])
runCaptured('pod', ['--version'])

run('SwiftLint 0 warning', process.execPath, [join(ROOT, 'scripts', 'swiftlint.mjs')])
runExpoPrebuild()
if (!existsSync(WORKSPACE)) fail(`pod install 后 workspace 不存在：${WORKSPACE}`)
// prebuild 会把本机 Node 绝对路径写进忽略目录。强制换成当前验证进程使用的
// managed Node，避免开发机旧 nvm 路径或 IDE shim 污染 Xcode 的打包脚本。
writeFileSync(join(IOS_DIR, '.xcode.env.local'), `export NODE_BINARY=${shellQuote(process.execPath)}\n`)
buildIos()
verifyProduct()
console.log('\n✓ iOS 验证全部通过：SwiftLint 0 warning + Release 设备版编译 + 产物真实性校验')
