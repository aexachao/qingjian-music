import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

/**
 * 第 8 轮：列表首屏用骨架屏替换转圈。
 * 骨架的几何要与真实列表对齐（否则加载完成时会跳位），且不断言渲染，只断言接线，
 * 免得改个像素就挂。
 */
describe('骨架屏组件', () => {
  it('导出四类骨架，覆盖曲目行 / 头像行 / 封面网格 / 流派卡', () => {
    const src = readSource('components/skeleton.tsx')
    expect(src).toContain('export function TrackListSkeleton')
    expect(src).toContain('export function AvatarListSkeleton')
    expect(src).toContain('export function CardGridSkeleton')
    expect(src).toContain('export function GenreGridSkeleton')
  })

  it('用 reanimated 在 UI 线程做脉冲，不是 setInterval 改 state', () => {
    const src = readSource('components/skeleton.tsx')
    expect(src).toContain('useSharedValue')
    expect(src).toContain('withRepeat')
    // 卸载时取消动画，别让它在后台空转
    expect(src).toContain('cancelAnimation(opacity)')
  })

  it('骨架块颜色走 skeleton 令牌（深浅色各一份），不写死色值', () => {
    const src = readSource('components/skeleton.tsx')
    expect(src).toContain('colors.skeleton2')
  })
})

describe('列表首屏改用骨架屏（不再是居中转圈）', () => {
  const cases: { file: string; skeleton: string }[] = [
    { file: 'screens/track-list-screen.tsx', skeleton: 'TrackListSkeleton' },
    { file: 'screens/albums.tsx', skeleton: 'CardGridSkeleton' },
    { file: 'screens/artists.tsx', skeleton: 'AvatarListSkeleton' },
    { file: 'screens/genres.tsx', skeleton: 'GenreGridSkeleton' },
    { file: 'screens/playlists.tsx', skeleton: 'TrackListSkeleton' },
    { file: 'screens/favorites.tsx', skeleton: 'TrackListSkeleton' },
    { file: 'screens/playlist-detail.tsx', skeleton: 'TrackListSkeleton' },
    { file: 'screens/search-result-list.tsx', skeleton: 'TrackListSkeleton' },
  ]

  for (const { file, skeleton } of cases) {
    it(`${file} 首屏用 ${skeleton}，且不再引 LoadingState`, () => {
      const src = readSource(file)
      expect(src).toContain(`<${skeleton}`)
      // 首屏 pending 分支不再用居中转圈
      expect(src).not.toContain('return <LoadingState />')
    })
  }
})
