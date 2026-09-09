import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const queueSource = readFileSync(resolve(__dirname, '../../src/components/player/player-queue.tsx'), 'utf8')
const playerSource = readFileSync(resolve(__dirname, '../../src/app/player.tsx'), 'utf8')

describe('播放器队列 Tab 交互', () => {
  it('默认展示继续播放并在原标题位置提供历史记录 Tab', () => {
    expect(queueSource).toContain("useState<QueueTab>('upcoming')")
    expect(queueSource).toContain('label="继续播放"')
    expect(queueSource).toContain('label="历史记录"')
    expect(queueSource).toContain('accessibilityRole="tablist"')
  })

  it('不再使用隐藏历史区、初始偏移或吸附', () => {
    expect(queueSource).toContain('`${tab}_${item.qid}_${itemIndex}`')
    expect(queueSource).not.toContain('historySnapTarget')
    expect(queueSource).not.toContain('contentOffset={{')
    expect(queueSource).not.toContain('initialScrollIndex=')
  })

  it('队列来源位于播放器顶部把手下方', () => {
    expect(playerSource).toContain('<View style={styles.dragHandle} />')
    expect(playerSource).toContain('<Text style={styles.queueSource}>来自 {source.label}</Text>')
  })

  it('历史清除靠右并经过破坏性二次确认', () => {
    expect(queueSource).toContain("Alert.alert('清除历史记录？', '该操作不可撤销。'")
    expect(queueSource).toContain("{ text: '清除', style: 'destructive'")
    expect(queueSource).toContain('<View style={styles.queueTabSpacer} />')
  })

  it('选中横条缩窄为精致胶囊并支持平滑位移与非选中项 regular 字体', () => {
    expect(queueSource).toContain('width: 16')
    expect(queueSource).toContain('fontFamily: fonts.regular')
    expect(queueSource).toContain('indicatorX.value = withTiming')
  })

  it('排序把手需长按 350ms 才激活', () => {
    expect(queueSource).toContain('const LONG_PRESS_MS = 350')
    expect(queueSource).toContain('onLongPress={() => {')
    expect(queueSource).toContain('delayLongPress={LONG_PRESS_MS}')
    expect(queueSource.indexOf('setDragHandlePressed(true)')).toBeGreaterThan(queueSource.indexOf('onLongPress={() => {'))
  })

  it('按下把手以及拖动期间都关闭行左滑识别', () => {
    expect(queueSource).toContain('enabled={swipeEnabled && !dragHandlePressed}')
    expect(queueSource).toContain('runOnJS(setDragging)(true)')
    expect(queueSource).toContain('dismissedSwipeOnHandlePress.current = closeOpenQueueAction()')
    expect(queueSource).toContain('onDragEnd={onDragEnd}')
  })

  it('Tab 切换支持双向循环且依赖项包含最新 tab 避免闭包死锁', () => {
    // 确保 onTabChange 依赖项包含 tab，防止切到历史后无法切回继续播放
    expect(queueSource).toMatch(/onTabChange\s*=\s*useCallback\([\s\S]*?,\s*\[[\s\S]*?\btab\b[\s\S]*?\]\)/)
    // 采用双页预渲染平移架构：彻底移除渐变，纯粹横向位移动画
    expect(queueSource).toContain('pagerX.value = withTiming')
    expect(queueSource).toContain('styles.pagerViewport')
    expect(queueSource).toContain('styles.pagerTrack')
    expect(queueSource).not.toContain('slideOpacity')
  })
})
