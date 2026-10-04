import { describe, expect, it } from 'vitest'
import { hasCode, hasNoCode, readSource } from '../support/source'

describe('Tab 切换过渡动画与组件规范', () => {
  it('搜索页、收藏页、艺术家详情页均采用 TabPager 包裹内容页并保持横向滑动过渡', () => {
    for (const screen of ['screens/search-query.tsx', 'screens/favorites.tsx', 'screens/artist-detail.tsx']) {
      expect(hasCode(screen, '<TabPager'), screen).toBe(true)
      expect(hasCode(screen, 'activeIndex='), screen).toBe(true)
    }
  })

  it('艺术家详情页在页签切换时同步折叠阈值以内的滚动距离', () => {
    const artistDetail = readSource('screens/artist-detail.tsx')
    expect(artistDetail).toContain("useState<ArtistTab>('tracks')")
    expect(artistDetail).toContain('albumsListRef')
    expect(artistDetail).toContain('tracksListRef')
    expect(artistDetail.indexOf("{ key: 'tracks', label: '歌曲' }")).toBeLessThan(artistDetail.indexOf("{ key: 'albums', label: '专辑' }"))
    expect(artistDetail.indexOf('ref={tracksListRef}')).toBeLessThan(artistDetail.indexOf('ref={albumsListRef}'))
    expect(artistDetail).not.toContain('overviewListRef')
    expect(artistDetail).not.toContain('topTracksQuery')
    expect(artistDetail).toContain('Math.min(220')
  })

  it('SegmentedTabs 采用单实例平滑指示条 slidingIndicator', () => {
    const tabs = readSource('components/segmented-tabs.tsx')
    expect(tabs).toContain('slidingIndicator')
    expect(tabs).toContain('indicatorAnimatedStyle')
    expect(tabs).toContain('Easing.bezier(0.25, 0.1, 0.25, 1)')
  })
})

describe('Mini 播放器进度描边：黑白灰单色极简美学', () => {
  it('迷你播放器进度描边不使用品牌红，使用 textPrimary（深色纯白/浅色纯黑）', () => {
    const mini = readSource('components/mini-player.tsx')
    expect(mini).toContain('stroke={colors.textPrimary}')
    expect(hasNoCode('components/mini-player.tsx', 'stroke={colors.playing}')).toBe(true)
  })

  it('迷你播放器保留外描边几何架构与浅灰轨道背景', () => {
    const mini = readSource('components/mini-player.tsx')
    expect(mini).toContain('colors.playerProgressTrack')
    expect(mini).toContain('artworkWrapper')
    expect(mini).toContain('FRAME_SIZE')
  })
})
