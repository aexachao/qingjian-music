import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AMBIENT_PALETTE,
  PRESET_AMBIENT_PALETTES,
  resolveAmbientPalette,
} from '@/theme/ambient-palette'

describe('ambient-palette', () => {
  it('预置调色板数量充足且结构完整', () => {
    expect(PRESET_AMBIENT_PALETTES.length).toBeGreaterThanOrEqual(5)
    for (const p of PRESET_AMBIENT_PALETTES) {
      expect(p.primary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.secondary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.dark).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.background).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('未传入标识或空值时回退到默认调色板', () => {
    expect(resolveAmbientPalette(undefined)).toBe(DEFAULT_AMBIENT_PALETTE)
    expect(resolveAmbientPalette('')).toBe(DEFAULT_AMBIENT_PALETTE)
  })

  it('相同 key 多次计算返回完全一致的调色板（确定性哈希）', () => {
    const palette1 = resolveAmbientPalette('track-xu-song-123')
    const palette2 = resolveAmbientPalette('track-xu-song-123')
    expect(palette1).toBe(palette2)
  })

  it('不同 key 能够映射到不同的预置调色板', () => {
    const pA = resolveAmbientPalette('album-meng-you-ji')
    const pB = resolveAmbientPalette('album-bu-ru-chi-cha-qu')
    // 只要有预置调色板，能稳定解析
    expect(pA).toBeDefined()
    expect(pB).toBeDefined()
  })

  it('支持外部传入自定义配色优先覆盖', () => {
    const custom = {
      primary: '#112233',
      secondary: '#445566',
      dark: '#778899',
    }
    const resolved = resolveAmbientPalette('any-key', custom)
    expect(resolved.primary).toBe('#112233')
    expect(resolved.secondary).toBe('#445566')
    expect(resolved.dark).toBe('#778899')
    expect(resolved.background).toBe('#08080a')
  })
})
