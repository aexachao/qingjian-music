import { describe, expect, it } from 'vitest'
import { themeColors } from '../../src/theme/tokens'

/**
 * 第 3 轮（配色规范）的核心不变量。
 *
 * 背景：以前 `accent`、`danger`、`like`、`playing` **是同一个值** —— 也就是说
 * 「改品牌色」会把删除这类危险动作、收藏的心形一起改掉，而「少用红」也没有旋钮可拧。
 * 这里把「拆开了」这件事钉死：谁把它们又合并回去，测试就红。
 */
const MODES = ['dark', 'light'] as const

describe('品牌色与危险色 / 收藏色是独立的 knob', () => {
  it.each(MODES)('%s：danger 与 like 都不等于品牌色', (mode) => {
    const colors = themeColors[mode]
    expect(colors.danger).not.toBe(colors.accent)
    expect(colors.like).not.toBe(colors.accent)
    expect(colors.danger).not.toBe(colors.like)
  })

  it.each(MODES)('%s：语义角色映射到预期的来源', (mode) => {
    const colors = themeColors[mode]
    // 状态与主行动仍走品牌色（这两个是「红」该在的地方）
    expect(colors.primaryAction).toBe(colors.accent)
    expect(colors.stateSelected).toBe(colors.accent)
    expect(colors.playing).toBe(colors.accent)
    expect(colors.brandTint).toBe(colors.accent)
    // 普通动作一律中性色 —— 超预算的红就出在这里
    expect(colors.actionText).toBe(colors.textPrimary)
    expect(colors.actionTextMuted).toBe(colors.textSecondary)
    expect(colors.disabledText).toBe(colors.textQuaternary)
  })

  it.each(MODES)('%s：二维码底色永远是白（深色下反色就扫不出来）', (mode) => {
    expect(themeColors[mode].qrSurface).toBe('#ffffff')
  })

  it('封面占位的记号比底色更有存在感（浅色下更深、深色下更浅）', () => {
    // 这两个值是半透明叠色，所以先合成到「页面底色 → 占位底 → 记号」再比亮度
    const parse = (hex: string) => {
      const int = (from: number) => parseInt(hex.slice(from, from + 2), 16)
      return {
        r: int(1),
        g: int(3),
        b: int(5),
        a: hex.length >= 9 ? int(7) / 255 : 1,
      }
    }
    const over = (fg: string, bg: { r: number; g: number; b: number }) => {
      const f = parse(fg)
      return {
        r: f.r * f.a + bg.r * (1 - f.a),
        g: f.g * f.a + bg.g * (1 - f.a),
        b: f.b * f.a + bg.b * (1 - f.a),
      }
    }
    const lum = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

    for (const mode of MODES) {
      const colors = themeColors[mode]
      const page = parse(colors.bgPrimary)
      const tile = over(colors.coverPlaceholder, page)
      const mark = over(colors.coverPlaceholderMark, tile)
      // 浅色：记号比底更深；深色：记号比底更浅（不然看不见）——两边都是「更有存在感」
      if (mode === 'light') expect(lum(mark)).toBeLessThan(lum(tile))
      else expect(lum(mark)).toBeGreaterThan(lum(tile))
      // 而且记号不能是品牌红（一屏列表全是红的，就是这次要修的问题）
      expect(colors.coverPlaceholderMark).not.toBe(colors.accent)
    }
  })

  it('深/浅两套的键完全一致（漏配一个就是运行时 undefined）', () => {
    expect(Object.keys(themeColors.dark).sort()).toEqual(Object.keys(themeColors.light).sort())
  })
})
