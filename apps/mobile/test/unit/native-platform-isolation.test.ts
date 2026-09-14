import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rntpPatchPath = fileURLToPath(
  new URL('../../../../patches/react-native-track-player@4.1.2.patch', import.meta.url),
)

function modulePath(module: string, file: string) {
  return fileURLToPath(new URL(`../../modules/${module}/${file}`, import.meta.url))
}

// ── 平台与原生模块替身 ────────────────────────────────────────────────────────
// 变量名必须以 `mock` 开头，否则 vi.mock 的工厂引用不到（vitest 的硬性要求）
const mockPlatform = { OS: 'android' as 'android' | 'ios' | 'web' }
const mockRequireNativeView = vi.fn()
const mockSystemVolumeNative = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  getSystemVolume: vi.fn(() => 0.5),
  setSystemVolume: vi.fn(async () => {}),
}
const mockRequireNativeModule = vi.fn(() => mockSystemVolumeNative)

vi.mock('react-native', () => ({ Platform: mockPlatform }))
vi.mock('expo', () => ({
  requireNativeView: mockRequireNativeView,
  requireNativeModule: mockRequireNativeModule,
}))

beforeEach(() => {
  vi.resetModules()
  mockRequireNativeView.mockClear()
  mockRequireNativeModule.mockClear()
})

/**
 * ── 为什么断言「行为」而不是「文件内容」 ─────────────────────────────────────
 *
 * 这个文件原来断言的是 `modules/<模块>/index.android.tsx` **文件存在、且内容里没有
 * `requireNativeView`**。它一直是绿的 —— 但那个文件**从来没有被用过**：
 * Metro 解析目录时的扩展名优先序是
 *
 *     .android.ts → .native.ts → .ts → .android.tsx → …
 *
 * `ts` 排在 `android.tsx` 前面，所以同目录只要存在 `index.ts`，平台文件
 * `index.android.tsx` 就永远选不中。文件写得再对也没用。
 *
 * 结果：Android 包里打进了 iOS 的 `requireNativeView('SystemVolume')`，
 * 点开播放页时 Fabric 找不到 ViewManager 直接 SIGABRT，屏幕上什么都不显示。
 * **而这条测试一直通过** —— 「永远为真」的规则比没有规则更糟，因为它给了
 * 一种被保护了的错觉。
 *
 * 现在改成 mock 掉 `Platform` 后真去 import 模块，直接观察原生模块有没有被求值。
 * 这正是原 bug 会失败的形态。
 */
describe('本地原生模块的平台隔离（行为断言）', () => {
  it.each(['android', 'web'] as const)(
    '%s 上求值 system-volume 不会创建原生视图',
    async (os) => {
      mockPlatform.OS = os
      await import('../../modules/system-volume')
      expect(mockRequireNativeView).not.toHaveBeenCalled()
    },
  )

  it.each(['android', 'web'] as const)(
    '%s 上求值 airplay-button 不会创建原生视图',
    async (os) => {
      mockPlatform.OS = os
      await import('../../modules/airplay-button')
      expect(mockRequireNativeView).not.toHaveBeenCalled()
    },
  )

  it('iOS 上两者仍然创建各自的原生视图 —— 隔离不能以牺牲 iOS 为代价', async () => {
    mockPlatform.OS = 'ios'
    await import('../../modules/system-volume')
    await import('../../modules/airplay-button')
    expect(mockRequireNativeView).toHaveBeenCalledWith('SystemVolume')
    expect(mockRequireNativeView).toHaveBeenCalledWith('AirplayButton')
  })

  it('system-volume 不是 Apple-only：Android 上仍连上真实原生模块', async () => {
    // 一期 F2：Android 侧补了 AudioManager 实现，入口必须真正连上原生模块，
    // 不能退回成「只改内存变量」的桩。
    mockPlatform.OS = 'android'
    const mod = await import('../../modules/system-volume')
    expect(mockRequireNativeModule).toHaveBeenCalledWith('SystemVolume')

    await mod.setSystemVolume(0.3)
    expect(mockSystemVolumeNative.setSystemVolume).toHaveBeenCalledWith(0.3)

    const listener = vi.fn()
    mod.addVolumeListener(listener)
    expect(mockSystemVolumeNative.addListener).toHaveBeenCalledWith('onVolumeChange', expect.any(Function))
  })

  it('非 iOS 上音量滑杆渲染 null，不会去挂载一个不存在的视图', async () => {
    // 直接当函数调用即可：非 iOS 分支返回的就是普通函数组件
    const renderAsFunction = (component: unknown, props: unknown) =>
      (component as (p: unknown) => unknown)(props)

    mockPlatform.OS = 'android'
    const mod = await import('../../modules/system-volume')
    expect(renderAsFunction(mod.SystemVolumeSlider, {})).toBeNull()

    mockPlatform.OS = 'web'
    vi.resetModules()
    const webMod = await import('../../modules/system-volume')
    expect(renderAsFunction(webMod.SystemVolumeSlider, {})).toBeNull()
  })

  it('Android 的原生侧确实实现了 AudioManager 音量读写', () => {
    const moduleConfig = JSON.parse(readFileSync(modulePath('system-volume', 'expo-module.config.json'), 'utf8'))
    expect(moduleConfig.platforms).toContain('android')
    expect(moduleConfig.android.modules).toEqual(['expo.modules.systemvolume.SystemVolumeModule'])

    const kotlin = readFileSync(
      modulePath('system-volume', 'android/src/main/java/expo/modules/systemvolume/SystemVolumeModule.kt'),
      'utf8',
    )
    expect(kotlin).toContain('AudioManager.STREAM_MUSIC')
    // flags 传 0 才不会弹系统音量 HUD，与 iOS 的静默改音量对齐
    expect(kotlin).toContain('setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)')
    expect(kotlin).toContain('android.media.VOLUME_CHANGED_ACTION')
  })

  it('RNTP iOS Bridge 不导出原生未实现的睡眠定时器方法', () => {
    const patch = readFileSync(rntpPatchPath, 'utf8')
    for (const method of [
      'setSleepTimer',
      'clearSleepTimer',
      'getSleepTimerProgress',
      'sleepWhenActiveTrackReachesEnd',
    ]) {
      expect(patch).toContain(`-RCT_EXTERN_METHOD(${method}`)
    }
  })

  it('SystemVolume 不在 Expo Module 构造期间创建 UIKit 视图', () => {
    const source = readFileSync(modulePath('system-volume', 'ios/SystemVolumeModule.swift'), 'utf8')
    const moduleSource = source.slice(source.indexOf('public class SystemVolumeModule'))

    // 声明期不创建 MPVolumeView（模块可能在非主线程初始化），首次设音量时才在主线程懒建
    expect(moduleSource).not.toMatch(/(?:let|lazy var)\s+sharedVolumeView\s*=\s*MPVolumeView\(\)/)
    expect(moduleSource).toContain('await MainActor.run')
    // 视图跨调用复用：每次新建的 MPVolumeView 立刻写音量会被系统忽略
    expect(moduleSource).toContain('if self.sharedVolumeView == nil {')
    expect(moduleSource).toContain('self.sharedVolumeView = view')
  })
})
