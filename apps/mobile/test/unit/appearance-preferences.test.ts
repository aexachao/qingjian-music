import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(relPath: string): string {
  return readFileSync(resolve(__dirname, `../../src/${relPath}`), 'utf8')
}

describe('外观主题与 Logo 自定义选择规范', () => {
  const appearancePrefsSource = source('lib/appearance-preferences.ts')
  const appearanceScreenSource = source('screens/appearance-settings.tsx')
  const settingsScreenSource = source('screens/settings.tsx')
  const layoutSource = source('app/_layout.tsx')
  const stackOptionsSource = source('lib/stack-options.ts')
  const loginSource = source('app/login.tsx')
  const aboutSource = source('screens/about.tsx')

  it('外观配置中心：默认主题为跟随系统，默认 Logo 为第 2 张经典绯红', () => {
    expect(appearancePrefsSource).toContain("themeMode: 'system'")
    expect(appearancePrefsSource).toContain("activeLogoId: DEFAULT_LOGO_ID")
    expect(appearancePrefsSource).toContain("export const DEFAULT_LOGO_ID = 'crimson-glass'")
    expect(appearancePrefsSource).toContain("KEY_APPEARANCE_PREFS = 'qj.prefs.appearance'")
  })

  it('官方提供 4 款高质量 Logo 选项，第 2 款标为 isDefault', () => {
    expect(appearancePrefsSource).toContain("id: 'dark-bars'")
    expect(appearancePrefsSource).toContain("name: '暗夜声律'")
    expect(appearancePrefsSource).toContain("id: 'crimson-glass'")
    expect(appearancePrefsSource).toContain("name: '经典绯红'")
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
