import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const modules = ['airplay-button'] as const
const rntpPatchPath = fileURLToPath(new URL('../../../../patches/react-native-track-player@4.1.2.patch', import.meta.url))

function modulePath(module: string, file: string) {
  return fileURLToPath(new URL(`../../modules/${module}/${file}`, import.meta.url))
}

describe('Apple-only 本地模块跨平台隔离', () => {
  it.each(modules)('%s 为 Android 和 Web 提供不求值原生模块的入口', (module) => {
    for (const platform of ['android', 'web']) {
      const source = readFileSync(modulePath(module, `index.${platform}.tsx`), 'utf8')
      expect(source).not.toMatch(/requireNative(Module|View)/)
      expect(source).not.toContain("from 'expo'")
    }
  })

  it('system-volume 已不再是 Apple-only：Android 走真实原生模块', () => {
    // 一期 F2：Android 侧补了 AudioManager 实现，入口必须真正连上原生模块，
    // 不能再是「只改内存变量」的桩。
    const androidEntry = readFileSync(modulePath('system-volume', 'index.android.tsx'), 'utf8')
    expect(androidEntry).toContain("requireNativeModule('SystemVolume')")
    expect(androidEntry).toContain('SystemVolumeModule.setSystemVolume(volume)')
    expect(androidEntry).toContain("addListener('onVolumeChange'")

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
    for (const method of ['setSleepTimer', 'clearSleepTimer', 'getSleepTimerProgress', 'sleepWhenActiveTrackReachesEnd']) {
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
