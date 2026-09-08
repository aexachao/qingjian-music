import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(path: string): string {
  return readFileSync(resolve(__dirname, `../../src/${path}`), 'utf8')
}

describe('临时交互层手势优先级', () => {
  it('快捷菜单由原生 Modal 遮罩独占触摸，点击外部只关闭菜单', () => {
    const deck = source('components/player/player-deck.tsx')
    expect(deck).toContain('<Modal visible={open} transparent')
    expect(deck).toContain('style={StyleSheet.absoluteFill}')
    expect(deck).toContain('onPress={() => setOpen(false)}')
    expect(deck).toContain('<View style={styles.menuCard}>')
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
})
