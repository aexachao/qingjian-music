import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

describe('外观主题与 Logo 自定义选择规范', () => {
  const appearancePrefsSource = readSource('lib/appearance-preferences.ts')
  const appearanceScreenSource = readSource('screens/appearance-settings.tsx')
  const settingsScreenSource = readSource('screens/settings.tsx')
  const layoutSource = readSource('app/_layout.tsx')
  const stackOptionsSource = readSource('lib/stack-options.ts')
  const loginSource = readSource('app/login.tsx')
  const aboutSource = readSource('screens/about.tsx')

  it('外观配置中心：默认主题为跟随系统，默认 Logo 为绯红声谱', () => {
    expect(appearancePrefsSource).toContain("themeMode: 'system'")
    expect(appearancePrefsSource).toContain("activeLogoId: DEFAULT_LOGO_ID")
    expect(appearancePrefsSource).toContain("export const DEFAULT_LOGO_ID = 'crimson-bars'")
    expect(appearancePrefsSource).toContain("KEY_APPEARANCE_PREFS = 'qj.prefs.appearance'")
  })

  it('官方提供 3 款高质量 Logo 选项，绯红声谱标为 isDefault', () => {
    expect(appearancePrefsSource).toContain("id: 'dark-bars'")
    expect(appearancePrefsSource).toContain("name: '暗夜声律'")
    expect(appearancePrefsSource).not.toContain("id: 'crimson-glass'")
    expect(appearancePrefsSource).not.toContain("name: '经典绯红'")
    expect(appearancePrefsSource).toContain('isDefault: true')
    expect(appearancePrefsSource).toContain("id: 'gold-glow'")
    expect(appearancePrefsSource).toContain("name: '流光金弦'")
    expect(appearancePrefsSource).toContain("id: 'crimson-bars'")
    expect(appearancePrefsSource).toContain("name: '绯红声谱'")
  })

  it('应用主题支持亮色、暗色、跟随系统 3 种模式定义与规范 Hook', () => {
    expect(appearancePrefsSource).toContain("value: 'system'")
    expect(appearancePrefsSource).toContain("label: '跟随系统'")
    expect(appearancePrefsSource).toContain("value: 'dark'")
    expect(appearancePrefsSource).toContain("label: '暗色'")
    expect(appearancePrefsSource).toContain("value: 'light'")
    expect(appearancePrefsSource).toContain("label: '亮色'")

    expect(appearancePrefsSource).toContain('export function useEffectiveTheme()')
    expect(appearancePrefsSource).toContain('export function useAppLogo()')
  })

  it('导航主题根据深浅色模式动态输出对应底色与文本色', () => {
    expect(stackOptionsSource).toContain('export function getNavigationTheme(')
    expect(stackOptionsSource).toContain("theme === 'dark' ? DarkTheme : DefaultTheme")
    expect(stackOptionsSource).toContain('getThemeColors(theme)')
    expect(stackOptionsSource).toContain('export function useStackScreenOptions()')
    expect(stackOptionsSource).not.toContain('headerStyle:')
  })

  it('根布局 _layout 动态响应系统与用户主题及状态栏', () => {
    expect(layoutSource).toContain('useEffectiveTheme()')
    expect(layoutSource).toContain('getNavigationTheme(effectiveTheme)')
    expect(layoutSource).toContain("StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'}")
  })

  it('设置首页包含「外观主题」入口，指向 /(tabs)/settings/appearance', () => {
    expect(settingsScreenSource).toContain("label=\"外观主题\"")
    expect(settingsScreenSource).toContain("router.push('/(tabs)/settings/appearance')")
    expect(settingsScreenSource).toContain("icon=\"appearance\"")
  })

  it('外观主题二级页面完整实现「应用主题」与「应用图标」两个卡片分区', () => {
    expect(appearanceScreenSource).toContain('应用主题')
    expect(appearanceScreenSource).toContain('应用图标')
    expect(appearanceScreenSource).toContain('同步更换 App 内与桌面图标')
    expect(appearanceScreenSource).toContain('正在切换…')
    expect(appearanceScreenSource).toContain("Alert.alert('图标切换失败'")
    expect(appearanceScreenSource).toContain('APP_LOGOS.map')
    expect(appearanceScreenSource).toContain('THEME_MODE_OPTIONS.map')
    expect(appearanceScreenSource).toContain('setThemeMode')
    expect(appearanceScreenSource).toContain('setActiveLogoId')
  })

  it('全 App 关键场景（登录页、关于页）均动态接入 useAppLogo()', () => {
    expect(loginSource).toContain('useAppLogo()')
    expect(loginSource).toContain('source={activeLogo.source}')

    expect(aboutSource).toContain('useAppLogo()')
    expect(aboutSource).toContain('source={activeLogo.source}')
  })
})

describe('应用图标矩阵的排布契约', () => {
  const prefsSource = readSource('lib/appearance-preferences.ts')
  const screenSource = readSource('screens/appearance-settings.tsx')

  /** 图标在 APP_LOGOS 里的声明顺序，也就是界面顺序 */
  const logoOrder = [...prefsSource.matchAll(/id: '([a-z-]+)'/g)].map((match) => match[1])

  it('顺序：默认（绯红声谱）第一，暗夜声律第二，流光金弦第三', () => {
    expect(logoOrder).toEqual(['crimson-bars', 'dark-bars', 'gold-glow'])
  })

  it('默认图标必须排在第一位 —— 界面就是按数组顺序渲染的', () => {
    const defaultId = /export const DEFAULT_LOGO_ID = '([a-z-]+)'/.exec(prefsSource)?.[1]
    expect(defaultId).toBe('crimson-bars')
    expect(logoOrder[0]).toBe(defaultId)
  })

  it('三款图标的名字都在', () => {
    for (const name of ['绯红声谱', '暗夜声律', '流光金弦']) {
      expect(prefsSource).toContain(name)
    }
  })

  it('一行固定 4 格：只有 3 款时第 4 格留白，不能把 3 款拉伸铺满整行', () => {
    // flexGrow 会让 3 个图标各自撑大填满一整行，第 4 格就不存在了；
    // 用固定 width: '25%' 才能保证「不够四个也按四个排」。
    expect(screenSource).toContain("width: '25%'")
    expect(screenSource).not.toContain('flexGrow')
  })

  it('图标只显示名称，不显示下方描述小字', () => {
    expect(screenSource).toContain('{logo.name}')
    // 描述不再作为可见文本渲染（配对的样式也一并删掉）……
    expect(screenSource).not.toMatch(/>\s*\{logo\.description\}/)
    expect(screenSource).not.toContain('logoDesc')
    // ……但仍留在无障碍标签里：视觉上省掉一行小字，读屏用户不该跟着丢信息
    expect(screenSource).toContain('accessibilityLabel={`${logo.name}，${logo.description}')
  })
})
