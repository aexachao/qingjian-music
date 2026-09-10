import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colors, radius, spacing, typography } from '../../src/theme/tokens'

function source(path: string): string {
  return readFileSync(resolve(__dirname, `../../src/${path}`), 'utf8')
}

describe('首页 Apple Music 风格设计规范与架构契约', () => {
  it('间距系统遵循 8pt 与 Apple 规范（20pt 页边距，24pt 分区呼吸感，10pt 组内吸附）', () => {
    expect(spacing.pageMargin).toBe(20)
    expect(spacing.sectionGap).toBe(24)
    expect(spacing.titleGap).toBe(10)
    expect(spacing.shelfGap).toBe(16)
  })

  it('圆角系统具备 iOS 标准专辑 8pt 圆角', () => {
    expect(radius.album).toBe(8)
    expect(radius.md).toBe(10)
  })

  it('排版系统符合 iOS SF Pro 字阶层级', () => {
    expect(typography.largeTitle.fontSize).toBe(34)
    expect(typography.title.fontSize).toBe(22)
    expect(typography.sectionTitle.fontSize).toBe(18)
    expect(typography.title3.fontSize).toBe(20)
    expect(typography.headline.fontSize).toBe(17)
    expect(typography.subhead.fontSize).toBe(15)
    expect(typography.footnote.fontSize).toBe(13)
    expect(typography.badge.fontSize).toBe(10)
  })

  it('表面与材质色彩定义完整', () => {
    expect(colors.surfaceGrouped).toBe('#121214')
    expect(colors.surfaceCard).toBe('#ffffff0d')
    expect(colors.hairlineBorder).toBe('#ffffff14')
    expect(colors.badgeBg).toBe('#ffffff14')
  })

  it('三等分功能瓷片采用原生 Pressable 实体背景色，去除副标题纯净呈现，并与上方漫游卡片紧凑组合', () => {
    const quickAsset = source('screens/home/QuickAssetRow.tsx')
    expect(quickAsset).not.toContain('<Link')
    expect(quickAsset).toContain('router.push')
    expect(quickAsset).toContain("backgroundColor: '#1f1f23'")
    expect(quickAsset).toContain("key: 'downloaded'")
    expect(quickAsset).not.toContain('私房金曲')
    expect(quickAsset).not.toContain('听歌足迹')
    expect(quickAsset).not.toContain('本地音乐')
    expect(quickAsset).toContain("width: '100%'")
    expect(quickAsset).not.toContain('cachedFilesCount')

    const home = source('screens/home.tsx')
    expect(home).toContain('heroGroup')
    expect(home).toContain('gap: 12')
  })

  it('页签根页大标题收起时为导航栏配置实体背景，防止滚动内容穿透重叠', () => {
    const stackOptions = source('lib/stack-options.ts')
    expect(stackOptions).toContain('headerLargeStyle: { backgroundColor: \'transparent\' }')
    expect(stackOptions).toContain('headerStyle: { backgroundColor: colors.bgPrimary }')
  })

  it('分区标题右侧箭头与标题保持 8pt 吸附间距，且字号为精致 18pt', () => {
    const header = source('screens/home/SectionHeader.tsx')
    expect(header).toContain('gap: 8')
    expect(header).toContain('chevronRight')
    expect(header).toContain('typography.sectionTitle')
  })

  it('全局单曲行与轮播行物理隔离「···」按钮，并前置格式 Tag 与播放动效', () => {
    const trackRow = source('components/track-row.tsx')
    expect(trackRow).toContain('<TrackMoreButton track={track} />')
    expect(trackRow).toContain('<LivePlayingBars size={11} />')
    expect(trackRow).toContain('<FormatBadge track={track} />')
    expect(trackRow).toContain('isGlobalMenuInteracting()')
    expect(trackRow).not.toContain('formatDuration')

    const carousel = source('screens/home/PagedTrackCarousel.tsx')
    expect(carousel).toContain('<TrackMoreButton')
    expect(carousel).toContain('<LivePlayingBars size={11} />')
    expect(carousel).toContain('<FormatBadge track={track} />')
    expect(carousel).toContain('isGlobalMenuInteracting()')
  })

  it('动态音符律动条初始/暂停态为平齐三点，高度小于歌名且等间距排布', () => {
    const bars = source('components/playing-bars.tsx')
    expect(bars).toContain('DEFAULT_HEIGHT = 11')
    expect(bars).toContain('BAR_WIDTH = 2.2')
    expect(bars).toContain('BAR_GAP = 2.4')
    expect(bars).toContain('minHeight = BAR_WIDTH')
    expect(bars).toContain('borderRadius: BAR_WIDTH / 2')
  })

  it('首页在快捷菜单展示期间建立全屏透明遮罩与防误触阻断', () => {
    const home = source('screens/home.tsx')
    expect(home).toContain('isMenuOpen')
    expect(home).toContain('isGlobalMenuInteracting')
    expect(home).toContain('StyleSheet.absoluteFill')
  })
})
