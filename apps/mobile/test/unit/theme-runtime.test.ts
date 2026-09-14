import { describe, expect, it } from 'vitest'
import { getThemeColors, palette, themeColors } from '../../src/theme/tokens'
import { readSource } from '../support/source'

describe('运行时主题 token 架构', () => {
  it('深浅色 palette 键完整对齐且返回稳定主题对象', () => {
    expect(Object.keys(palette.light).sort()).toEqual(Object.keys(palette.dark).sort())
    expect(getThemeColors('dark')).toBe(themeColors.dark)
    expect(getThemeColors('light')).toBe(themeColors.light)
    expect(themeColors.dark.bgPrimary).toBe('#0f0f0f')
    expect(themeColors.light.bgPrimary).toBe('#ffffff')
    expect(themeColors.dark.accent).toBe(themeColors.light.accent)
  })

  it('AppThemeProvider 提供颜色 hook 与响应式 StyleSheet 工厂', () => {
    const provider = readSource('theme/theme-provider.tsx')
    expect(provider).toContain('export function AppThemeProvider')
    expect(provider).toContain('export function useThemeColors')
    expect(provider).toContain('export function createThemedStyles')
    expect(provider).toContain('StyleSheet.create(factory(colors))')
  })

  it('根布局同时驱动应用主题、导航主题和状态栏', () => {
    const layout = readSource('app/_layout.tsx')
    expect(layout).toContain('<AppThemeProvider mode={effectiveTheme} followsSystem={followsSystem}>')
    expect(layout).toContain('getNavigationTheme(effectiveTheme)')
    expect(layout).toContain('useStackScreenOptions()')
    expect(layout).toContain("StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'}")
  })

  it('导航 options 动态生成且不写 headerStyle', () => {
    const stack = readSource('lib/stack-options.ts')
    expect(stack).toContain('export function useStackScreenOptions')
    expect(stack).toContain('contentStyle: { backgroundColor: colors.bgPrimary }')
    expect(stack).not.toContain('headerStyle:')
  })

  it('业务源码不再从 tokens 静态导入 colors', () => {
    const candidates = [
      'app/login.tsx',
      'app/player.tsx',
      'components/icon.tsx',
      'components/progress-bar.tsx',
      'components/player/player-queue.tsx',
      'screens/settings.tsx',
      'screens/appearance-settings.tsx',
    ]
    for (const file of candidates) {
      expect(readSource(file)).not.toMatch(/import \{[^}]*\bcolors\b[^}]*\} from ['"]@\/theme\/tokens['"]/)
    }
  })
})
