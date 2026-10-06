import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

function source(path: string): string {
  return readSource(path)
}

describe('临时交互层手势优先级', () => {
  it('快捷菜单由系统原生组件 MenuView 承载，并配置消费同级手势', () => {
    const btn = source('components/track-menu-button.tsx')
    expect(btn).toContain('<MenuView')
    expect(btn).toContain('onBeforeOpen?.()')
  })

  it('队列左滑打开时所有同级操作先消费关闭动作', () => {
    const queue = source('components/player/player-queue.tsx')
    expect(queue).toContain('const consumeOpenAction = useCallback')
    expect(queue).toContain('if (consumeOpenAction() || nextTab === tab) return')
    expect(queue).toContain('if (consumeOpenAction()) return')
    expect(queue).toContain('onScrollBeginDrag={() => {')
  })

  it('左滑关闭与卸载会清理引用，避免吞掉后续无关点击', () => {
    const queue = source('components/player/player-queue.tsx')
    expect(queue).toContain('onSwipeableClose={onSwipeableClose}')
    expect(queue).toContain('if (openSwipeableRef === swipeableRef.current)')
    expect(queue).toContain('dismissedSwipeOnHandlePress.current = closeOpenQueueAction()')
    expect(queue).toContain('if (dismissedSwipeOnHandlePress.current) return')
  })

  // 歌词分享使用原生 pageSheet；关闭与选择行为由 lyric-motion 实际渲染测试覆盖。

  it('快捷菜单包含歌曲选项分组，跳转二级页面时先收起播放器', () => {
    const btn = source('components/track-menu-button.tsx')
    expect(btn).toContain('歌曲选项')

    const menu = source('lib/track-menu.ts')
    expect(menu).toContain('添加到歌单')
    expect(menu).toContain('分享歌曲')
    expect(menu).toContain('分享歌词')
    expect(menu).toContain('歌曲信息')
    expect(menu).toContain('前往专辑')
    expect(menu).toContain('查看艺术家')

    // DeckMoreButton 已拆到 deck-more-button.tsx
    const deck = source('components/player/deck-more-button.tsx')
    expect(deck).toContain('onNavigate={onDismissWithAction}')

    const hook = source('lib/use-track-menu.ts')
    expect(hook).toContain('router.back()')
  })

  it('专辑 / 艺术家 / 流派 / 歌单四个二级页头部显式配置返回按钮', () => {
    for (const path of ['album-detail', 'artist-detail', 'genre-detail', 'playlist-detail']) {
      expect(source(`screens/${path}.tsx`), path).toContain('headerLeft: () => <StackBackButton')
    }
  })

  it('透明的播放按钮不能继续占用原生导航胶囊或响应误触', () => {
    for (const path of ['album-detail', 'genre-detail', 'playlist-detail']) {
      const screen = source(`screens/${path}.tsx`)
      const actions = screen.slice(screen.indexOf('headerRight:'), screen.indexOf('<MenuView', screen.indexOf('headerRight:')))
      expect(actions, path).toContain(path === 'album-detail' ? '{pinned && queueTracks.length > 0 && localAlbumConfirmed ? (' : '{pinned ? (')
      expect(actions, path).toContain(') : null}')
      expect(screen, path).not.toContain('navPlayAnimatedStyle')
    }
  })

  it('原生导航内的图标不使用旧版负边距补偿', () => {
    for (const path of ['screens/album-detail.tsx', 'screens/genre-detail.tsx', 'screens/playlist-detail.tsx', 'screens/favorites.tsx', 'screens/external-sources.tsx', 'components/stack-back-button.tsx']) {
      expect(source(path), path).not.toMatch(/margin(?:Left|Right):\s*-/)
    }
  })

  it('收藏页使用普通系统导航，分类栏不再猜测系统导航高度', () => {
    const screen = source('screens/favorites.tsx')
    expect(screen).toContain('headerTransparent: false')
    expect(screen).not.toContain('headerBackground:')
    expect(screen).not.toContain('topHeaderOffset')
    expect(screen).not.toContain('<BlurView')
    for (const area of ['home', 'library']) {
      expect(source(`app/(tabs)/${area}/_layout.tsx`)).not.toContain('name="favorites" options={detailScreenOptions}')
    }
  })

  it('二级页面全局返回按钮规范统一：均不显示「返回」文字，仅保留返回箭头', () => {
    const stackOptions = source('lib/stack-options.ts')
    expect(stackOptions).toContain("headerBackTitle: ''")
    expect(stackOptions).toContain("headerBackButtonDisplayMode: 'minimal'")
    expect(stackOptions).not.toContain("headerBackTitle: '返回'")
    const album = source('screens/album-detail.tsx')
    expect(album).not.toContain("headerBackTitle: '返回'")
  })

  it('四大页签根页遵循 Apple Music 大标题规范：消除原生 44pt 空白死区，大标题通顶并在上滑时由暗黑毛玻璃小标题导航栏遮盖', () => {
    const stackOptions = source('lib/stack-options.ts')
    expect(stackOptions).toContain('headerShown: false')

    const home = source('screens/home.tsx')
    expect(home).toContain('<CollapsibleHeaderBar title="首页"')
    expect(home).toContain('<LargeTitleHeader title="首页"')

    // 搜索页签的**浏览态**才是「四个 Tab 根页」里那个：输入态 / 结果态是二级页面（导航栏里放输入框）
    const search = source('screens/search-browse.tsx')
    expect(search).toContain('<CollapsibleHeaderBar title="搜索"')
    expect(search).toContain('<LargeTitleHeader title="搜索"')

    const library = source('screens/library-home.tsx')
    expect(library).toContain('<CollapsibleHeaderBar title="音乐库"')
    expect(library).toContain('<LargeTitleHeader title="音乐库"')

    const settings = source('screens/settings.tsx')
    expect(settings).toContain('<CollapsibleHeaderBar title="设置"')
    expect(settings).toContain('<LargeTitleHeader title="设置"')

    const header = source('components/collapsible-tab-header.tsx')
    expect(header).toContain("mode === 'dark' ? 'dark' : 'light'")
    expect(header).toContain('fontSize: 34')
    expect(header).toContain('fontSize: 17')
  })

  it('settings has feedback email, about, and cache screens with complete options', () => {
    const settings = source('screens/settings.tsx')
    expect(settings).toContain('arieachao@163.com')
    expect(settings).toContain('问题反馈')
    expect(settings).toContain('关于')
    expect(settings).toContain('缓存')
    // 音质入口 2026-09-16 撤掉了（飞牛只有一档输出，见 test/unit/audio-quality-gating.test.ts）
    expect(settings).not.toContain('音质')

    const about = source('screens/about.tsx')
    expect(about).toContain('轻简音乐')
    expect(about).toContain('评价应用')
    expect(about).toContain('用户协议')
    expect(about).toContain('隐私政策')
    expect(about).toContain('icon.png')

    const cacheScreen = source('screens/cache-settings.tsx')
    expect(cacheScreen).toContain('自动缓存歌曲')
    expect(cacheScreen).toContain('容量上限')
    expect(cacheScreen).toContain('歌曲数量上限')
    expect(cacheScreen).toContain('歌曲音频缓存')
    expect(cacheScreen).toContain('封面图片缓存')

    const qualityPrefs = source('lib/audio-quality-preferences.ts')
    expect(qualityPrefs).toContain('wifiQuality')
    expect(qualityPrefs).toContain('cellularQuality')
    expect(qualityPrefs).toContain('downloadQuality')

    const cachePrefs = source('lib/cache-preferences.ts')
    expect(cachePrefs).toContain('autoCacheEnabled')
    expect(cachePrefs).toContain('2GB')
    expect(cachePrefs).toContain('unlimited')
  })
})
