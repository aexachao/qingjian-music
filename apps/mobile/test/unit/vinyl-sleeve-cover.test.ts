import { describe, expect, it } from 'vitest'
import { hasCode, readSource } from '../support/source'

describe('黑胶唱片封套组件 (CDSleeveCover / VinylSleeveCover)', () => {
  const componentPath = 'components/cd-sleeve-cover.tsx'

  it('使用黑胶封套拟物化图片资源 vinyl-sleeve-case-dark.png 与 vinyl-sleeve-case-light.png', () => {
    expect(hasCode(componentPath, "require('../../assets/images/vinyl-sleeve-case-dark.png')")).toBe(true)
    expect(hasCode(componentPath, "require('../../assets/images/vinyl-sleeve-case-light.png')")).toBe(true)
  })

  it('几何常数与 463x428 模板设计对齐（400x400 方形封面视窗）', () => {
    const src = readSource(componentPath)
    expect(src).toContain('const BASE_WIDTH = 463')
    expect(src).toContain('const BASE_HEIGHT = 428')
    expect(src).toContain('const BASE_COVER_LEFT = 0')
    expect(src).toContain('const BASE_COVER_TOP = 6')
    expect(src).toContain('const BASE_COVER_WIDTH = 400')
    expect(src).toContain('const BASE_COVER_HEIGHT = 400')
    expect(src).toContain('const BASE_COVER_RADIUS = 8')
  })

  it('同时导出 CDSleeveCover 及语义别名 VinylSleeveCover', () => {
    const src = readSource(componentPath)
    expect(src).toContain('export function CDSleeveCover(')
    expect(src).toContain('export const VinylSleeveCover = CDSleeveCover')
  })

  it('专辑详情页面引用 CDSleeveCover 作为头图', () => {
    expect(hasCode('screens/album-detail.tsx', '<CDSleeveCover coverId={album.coverId} coverUrl={catalogCover} width={260} />')).toBe(true)
  })
})
