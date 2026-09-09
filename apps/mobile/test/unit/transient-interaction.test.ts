import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(path: string): string {
  return readFileSync(resolve(__dirname, `../../src/${path}`), 'utf8')
}

describe('临时交互层手势优先级', () => {
  it('快捷菜单由系统原生组件 MenuView 承载，并配置消费同级手势', () => {
    const deck = source('components/player/player-deck.tsx')
    expect(deck).toContain('<MenuView')
    expect(deck).toContain('onBeforeOpen?.()')
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

  it('歌词弹层点击遮罩只关闭弹层，卡片内部阻止冒泡', () => {
    const lyrics = source('components/lyric-view.tsx')
    expect(lyrics).toContain('style={StyleSheet.absoluteFill}')
    expect(lyrics).toContain('onPress={onClose}')
    expect(lyrics).toContain('<View style={styles.sheetCard}>')
  })

  it('快捷菜单包含歌曲选项分组，跳转二级页面时先收起播放器', () => {
    const deck = source('components/player/player-deck.tsx')
    expect(deck).toContain('歌曲选项')
    expect(deck).toContain('添加到歌单')
    expect(deck).toContain('分享歌曲')
    expect(deck).toContain('分享歌词')
    expect(deck).toContain('歌曲信息')
    expect(deck).toContain('前往专辑')
    expect(deck).toContain('查看艺术家')
    expect(deck).toContain('dismissAndNavigate')
    expect(deck).toContain('router.back()')
  })

  it('专辑与艺术家二级页面头部显式配置返回按钮', () => {
    const album = source('screens/album-detail.tsx')
    expect(album).toContain('headerLeft: () => <StackBackButton />')
    const artist = source('screens/artist-detail.tsx')
    expect(artist).toContain('headerLeft: () => <StackBackButton />')
  })
})
