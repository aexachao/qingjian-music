import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

const queueSource = readSource('components/player/player-queue.tsx')
const playerSource = readSource('app/player.tsx')

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

  it('播放器顶部只保留居中拖拽把手，不显示来自来源', () => {
    expect(playerSource).toContain('<View style={styles.dragHandle} />')
    expect(playerSource).not.toContain('来自 {source.label}')
    expect(playerSource).not.toContain('styles.queueSource')
  })

  it('历史清除靠右并经过破坏性二次确认', () => {
    expect(queueSource).toContain("title: '清除历史记录？'")
    expect(queueSource).toContain("confirmText: '清除'")
    expect(queueSource).toContain('destructive: true')
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

  it('列表在顶部允许下拉退出，采用 ScrollHandler 联动退场机制与橡皮筋反向补偿', () => {
    expect(playerSource).toContain('const [isListAtTop, setIsListAtTop] = useState(true)')
    expect(playerSource).toContain("if (mode === 'list') { setIsListAtTop(true)")
    expect(playerSource).toContain('createDismissPan={createDismissPan}')
    expect(playerSource).toContain("mode !== 'list' || isListAtTop")
    expect(queueSource).toContain('bounces={true}')
    expect(queueSource).toContain('alwaysBounceVertical={true}')
    expect(queueSource).toContain('gesture={headerOverlayDismissGesture}')
    expect(queueSource).not.toContain('ReorderableListCore')
  })

  it('播放器与播放列表中的收藏 icon 统一采用面性（实心）形态', () => {
    const iconSource = readSource('components/icon.tsx')
    const deckSource = readSource('components/player/player-deck.tsx')
    const queueSrc = readSource('components/player/player-queue.tsx')

    // OUTLINE_VARIANTS 不再包含 heart，全局 heart 恒为面性 glyph
    expect(iconSource).not.toContain("heart: 'heart-outline'")

    // PlayerDeck 和 PlayerQueue 均使用 filled={true}
    expect(deckSource).toContain('name="heart"')
    expect(deckSource).toContain('filled={true}')
    expect(queueSrc).toContain('name="heart"')
    expect(queueSrc).toContain('filled={true}')
  })

  it('上一首切歌逻辑接入 restorePreviousTrack 与 pendingPreviousActivation', () => {
    const controllerSource = readSource('player/controller.ts')
    const bridgeSource = readSource('player/bridge.tsx')

    expect(controllerSource).toContain('takePendingPreviousActivation')
    expect(controllerSource).toContain('pendingPreviousActivation')
    expect(bridgeSource).toContain('takePendingPreviousActivation')
    expect(bridgeSource).toContain('restorePreviousTrack')
    // 上一首恢复走 restorePreviousTrack 并保留待播队列；remove([1]) 只允许出现在历史点播分支里，
    // 所以它的位置必须排在 restorePreviousTrack 之后。
    expect(bridgeSource).toContain('usePlayerStore.getState().restorePreviousTrack(previousItem)')
    expect(bridgeSource).toContain('void TrackPlayer.remove([1])')
    expect(bridgeSource.indexOf('restorePreviousTrack(previousItem)')).toBeLessThan(
      bridgeSource.indexOf('void TrackPlayer.remove([1])'),
    )
  })

  it('待播行「···」菜单接上共享菜单组件，且与主触控区物理隔离', () => {
    // 条目规则与顺序在 lib/track-menu.ts 里单独跑行为单测，这里只锁接线与结构
    expect(queueSource).toContain('<TrackMenuButton')
    expect(queueSource).toContain('context="upcoming"')
    expect(queueSource).toContain('queueIndex,')
    expect(queueSource).toContain('upcomingCount,')
    // 左右是兄弟节点：否则「···」的点击会被外层 Pressable 抢走
    expect(queueSource).toContain('<View style={styles.rowWrapper}>')
    expect(queueSource).toContain('style={styles.rowMain}')
    expect(queueSource).toContain('style={styles.rowRight}')
    // 打开菜单前先收起左滑删除，避免两层操作面同时存在
    expect(queueSource).toContain('onBeforeOpen={() => {')
    expect(queueSource).toContain('closeOpenQueueAction()')
    // 菜单关闭后的冷却期内不响应行点按，否则「点空白关菜单」会顺手切歌
    expect(queueSource).toContain('if (isGlobalMenuInteracting()) return')
    // 待播行数只允许有一个定义
    expect(queueSource).toContain('const upcomingCount = Math.max(0, queue.length - 1)')
  })
})
