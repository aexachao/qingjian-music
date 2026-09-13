import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('运行时应用图标原生接入', () => {
  it('注册本地 Expo module 与幂等 config plugin', () => {
    const appConfig = read('app.json')
    const moduleConfig = read('modules/app-icon/expo-module.config.json')
    const plugin = read('plugins/with-app-icons.js')

    expect(appConfig).toContain('./plugins/with-app-icons')
    expect(appConfig).toContain('"userInterfaceStyle": "automatic"')
    expect(moduleConfig).toContain('AppIconModule')
    expect(moduleConfig).toContain('expo.modules.appicon.AppIconModule')
    expect(plugin).toContain('ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES')
    expect(plugin).toContain("application['activity-alias'] = [...retainedAliases, ...aliases]")
  })

  it('iOS 使用 UIApplication alternate icon，Android 使用 activity alias', () => {
    const ios = read('modules/app-icon/ios/AppIconModule.swift')
    const android = read('modules/app-icon/android/src/main/java/expo/modules/appicon/AppIconModule.kt')

    expect(ios).toContain('setAlternateIconName')
    expect(ios).toContain('alternateIconName')
    expect(android).toContain('setComponentEnabledSetting')
    expect(android).toContain('PackageManager.DONT_KILL_APP')
  })

  it('四款图标与默认经典绯红在 JS 和原生层一致', () => {
    const entry = read('modules/app-icon/index.ts')
    const ios = read('modules/app-icon/ios/AppIconModule.swift')
    const android = read('modules/app-icon/android/src/main/java/expo/modules/appicon/AppIconModule.kt')

    for (const id of ['dark-bars', 'crimson-glass', 'gold-glow', 'crimson-bars']) {
      expect(entry).toContain(`'${id}'`)
      expect(ios).toContain(`"${id}"`)
      expect(android).toContain(`"${id}"`)
    }
  })
})
