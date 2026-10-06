import { describe, expect, it } from 'vitest'
import { hasCode, hasNoCode, readSource } from '../support/source'

/**
 * 视觉一致性（第 3 轮补遗）：
 *   · 默认封面占位 = 浅灰底 + 品牌记号（只取记号、不取图标底色，也不跟随启动图标切换）；
 *   · 空状态在视窗里上下居中。
 * 两条都容易在改列表时被顺手改回去，所以钉住。
 */
describe('默认封面占位：浅灰底 + 品牌记号', () => {
  it('占位用的是品牌记号，不是别人的音符图标', () => {
    const cover = 'components/cover-image.tsx'
    expect(hasCode(cover, '<BrandMark')).toBe(true)
    expect(hasCode(cover, 'colors.coverPlaceholder')).toBe(true)
    // 以前这里用的是音符图标（苹果音乐的语言）
    expect(hasNoCode(cover, "name=\"tracks\"")).toBe(true)
  })

  it('不参与「设置里切换启动图标」：占位图不碰 app-icon 模块与那几个图标资源', () => {
    const cover = readSource('components/cover-image.tsx')
    for (const forbidden of ['app-icon', 'logo-crimson', 'logo-dark', 'logo-gold', 'APP_ICON']) {
      expect(cover.includes(forbidden), forbidden).toBe(false)
    }
  })

  it('品牌记号的几何是自洽的：灵动音符矢量、viewBox 就是量出来的包围盒', () => {
    // 断言源码里的几何数据本身（不 import 组件：那样会把 react-native-svg 拖进测试环境）
    const mark = readSource('components/brand-mark.tsx')
    expect(mark).toContain('export const BRAND_NOTE_PATH =')
    expect(mark).toContain('export const VIEW_BOX_WIDTH = 398')
    expect(mark).toContain('export const VIEW_BOX_HEIGHT = 648')
    expect(mark).toContain('export const BRAND_MARK_ASPECT = VIEW_BOX_WIDTH / VIEW_BOX_HEIGHT')
  })
})

describe('空状态在视窗里居中', () => {
  it('所有会渲染 ListEmptyComponent 的列表都让内容区撑满（flexGrow: 1）', () => {
    for (const path of [
      'screens/track-list-screen.tsx',
      // album-detail 的样式已拆到 album-detail.styles.ts
      'screens/album-detail.styles.ts',
      'screens/albums.tsx',
      'screens/artists.tsx',
      'screens/genres.tsx',
      'screens/playlists.tsx',
      // artist-detail 的样式已拆到 artist-detail.styles.ts
      'screens/artist-detail.styles.ts',
      'screens/search-result-list.tsx',
      'screens/search-query.tsx',
    ]) {
      expect(hasCode(path, 'flexGrow: 1'), path).toBe(true)
    }
  })

  it('空状态组件本身是「占满 + 居中」的', () => {
    expect(hasCode('components/list-states.tsx', 'center: { flex: 1, alignItems: \'center\', justifyContent: \'center\'')).toBe(
      true,
    )
  })
})
