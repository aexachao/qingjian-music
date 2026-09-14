import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPackageFile } from '../support/source'

const root = resolve(__dirname, '../..')
const read = readPackageFile

const require_ = createRequire(import.meta.url)
const plugin = require_(resolve(root, 'plugins/with-app-icons.js')) as {
  ICONS: { id: string; resource: string }[]
  buildAdaptiveIconXml: (icon: { id: string; resource: string }, opts?: { themed?: boolean }) => string
  buildIconColorResourcesXml: (icons: { id: string; resource: string }[]) => string
  writeAndroidIconAssets: (input: { resRoot: string; sourceRoot: string }) => void
}

/** 抽出 XML 里所有 `@color/xxx` 引用 */
const colorRefs = (xml: string) => [...xml.matchAll(/@color\/([A-Za-z0-9_]+)/g)].map((m) => m[1])
/** 抽出 XML 里所有 `<color name="xxx">` 声明 */
const colorDecls = (xml: string) => [...xml.matchAll(/<color name="([A-Za-z0-9_]+)"/g)].map((m) => m[1])

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

  it('三款图标与默认绯红声谱在 JS 和原生层一致', () => {
    const entry = read('modules/app-icon/index.ts')
    const ios = read('modules/app-icon/ios/AppIconModule.swift')
    const android = read('modules/app-icon/android/src/main/java/expo/modules/appicon/AppIconModule.kt')

    for (const id of ['dark-bars', 'gold-glow', 'crimson-bars']) {
      expect(entry).toContain(`'${id}'`)
      expect(ios).toContain(`"${id}"`)
      expect(android).toContain(`"${id}"`)
    }
  })
})

/**
 * 这一组是**生成产物**的行为测试，不是源码文本断言。
 *
 * 起因：CI 上 `:app:processReleaseResources` 挂在
 *   `'#F62C55' is incompatible with attribute drawable (attr) reference.`
 * ——插件把裸色值塞进了 `<background android:drawable="...">`，AAPT2 只认资源引用。
 * 上面那些 `toContain` 断言**结构上就抓不到**这类错误：源码里确实「有 background、
 * 有 @color」也可能两边对不上号。所以这里改为真的调用生成函数、再解析它吐出来的 XML。
 */
describe('自适应图标 XML 能被 AAPT2 链接', () => {
  const icons = plugin.ICONS

  it('android:drawable 里不出现裸色值（AAPT2 只接受资源引用）', () => {
    for (const icon of icons) {
      for (const xml of [plugin.buildAdaptiveIconXml(icon), plugin.buildAdaptiveIconXml(icon, { themed: true })]) {
        for (const [, value] of xml.matchAll(/android:drawable="([^"]*)"/g)) {
          expect(value).not.toMatch(/#/)
          expect(value).toMatch(/^@(color|drawable)\//)
        }
      }
    }
  })

  it('每个 @color 引用都有对应的 <color> 声明，反之亦然', () => {
    const refs = new Set(icons.flatMap((icon) => colorRefs(plugin.buildAdaptiveIconXml(icon))))
    const decls = new Set(colorDecls(plugin.buildIconColorResourcesXml(icons)))

    // 引用没有声明 → 链接期报 "resource color/xxx not found"
    expect([...refs].filter((name) => !decls.has(name))).toEqual([])
    // 声明没有引用 → 多余资源，说明两个生成函数漂移了
    expect([...decls].filter((name) => !refs.has(name))).toEqual([])
    expect(refs.size).toBe(icons.length)
  })

  it('三款图标的背景色都声明了，且绯红系用品牌色', () => {
    const values = plugin.buildIconColorResourcesXml(icons)

    expect(colorDecls(values)).toHaveLength(icons.length)
    for (const icon of icons) {
      expect(values).toContain(`<color name="${icon.resource}_background">`)
    }
    expect(values).toContain('<color name="app_icon_crimson_bars_background">#F62C55</color>')
    expect(values).toContain('<color name="app_icon_dark_bars_background">#000000</color>')
    expect(values).toContain('<color name="app_icon_gold_glow_background">#000000</color>')
  })

  it('v33 变体多一层 monochrome，v26 没有', () => {
    for (const icon of icons) {
      const v26 = plugin.buildAdaptiveIconXml(icon)
      const v33 = plugin.buildAdaptiveIconXml(icon, { themed: true })

      expect(v26).not.toContain('monochrome')
      expect(v33).toContain(`<monochrome android:drawable="@drawable/${icon.resource}_monochrome" />`)
      // 前景是位图，本来就该走 @drawable
      expect(v26).toContain(`<foreground android:drawable="@drawable/${icon.resource}_foreground" />`)
      expect(v33).toContain(`<foreground android:drawable="@drawable/${icon.resource}_foreground" />`)
    }
  })
})

/**
 * 真正跑一遍落盘逻辑，在临时目录里断言产物。
 * 上面那组只验证「构造函数自洽」，漏掉写文件这一步照样会绿。
 */
describe('Android 图标资源落盘', () => {
  const sourceRoot = resolve(root, 'assets/images/app-icons/android')

  it('源图齐全（缺一张就会在 prebuild 时抛 ENOENT）', () => {
    for (const icon of plugin.ICONS) {
      for (const suffix of ['foreground', 'monochrome', 'legacy']) {
        expect(existsSync(resolve(sourceRoot, `${icon.id}-${suffix}.png`))).toBe(true)
      }
    }
  })

  it('生成 v26/v33/legacy/values 四套产物，且 @color 全部有声明', () => {
    const resRoot = mkdtempSync(join(tmpdir(), 'app-icons-'))
    try {
      plugin.writeAndroidIconAssets({ resRoot, sourceRoot })

      const values = readFileSync(join(resRoot, 'values/app_icon_backgrounds.xml'), 'utf8')
      const declared = new Set(colorDecls(values))

      for (const icon of plugin.ICONS) {
        // legacy 位图（API < 26 的兜底）
        expect(existsSync(join(resRoot, `mipmap-xxxhdpi/${icon.resource}.png`))).toBe(true)

        for (const [dir, themed] of [
          ['mipmap-anydpi-v26', false],
          ['mipmap-anydpi-v33', true],
        ] as const) {
          const path = join(resRoot, dir, `${icon.resource}.xml`)
          expect(existsSync(path)).toBe(true)

          const xml = readFileSync(path, 'utf8')
          const refs = colorRefs(xml)
          expect(refs).toHaveLength(1)
          expect(declared.has(refs[0])).toBe(true)
          expect(xml.includes('monochrome')).toBe(themed)

          // 前景 / 单色位图必须真的存在，否则 @drawable 解析不到
          expect(existsSync(join(resRoot, `drawable-nodpi/${icon.resource}_foreground.png`))).toBe(true)
          expect(existsSync(join(resRoot, `drawable-nodpi/${icon.resource}_monochrome.png`))).toBe(true)
        }
      }
    } finally {
      rmSync(resRoot, { recursive: true, force: true })
    }
  })
})
