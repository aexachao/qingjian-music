import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

const queueSource = readSource('components/player/player-queue.tsx')
const playerSource = readSource('app/player.tsx')

describe('播放器队列竖轴交互', () => {
  it('采用单一竖轴：历史在上、正在播放居中、待播在下（已废弃左右 tab pager）', () => {
    // 不再有水平 tab：数据来自 queueAxisView / queueAxisRows
    expect(queueSource).toContain('queueAxisView(history, queue, index)')
    expect(queueSource).toContain('queueAxisRows(axis, index)')
    expect(queueSource).not.toContain("useState<QueueTab>")
    expect(queueSource).not.toContain('pagerX.value = withTiming')
  })

  it('历史在 ListHeader 里倒序渲染（不可拖），待播是列表数据（可拖）', () => {
    // 历史行渲在 ListHeaderComponent（renderHistoryRow），待播行是 ReorderableList 数据（renderUpcomingItem）
    expect(queueSource).toContain('const listHeader = (')
    expect(queueSource).toContain('renderHistoryRow(row)')
    expect(queueSource).toContain('ListHeaderComponent={listHeader}')
    expect(queueSource).toContain('data={upcomingRows}')
  })

  it('初始定位到「正在播放」（历史块高度为初始 offset）', () => {
    expect(queueSource).toContain('scrollToOffset({ offset: historyBlockH, animated: false })')
    expect(queueSource).toContain('didInitialScroll')
  })

  it('分段吸顶震动：跨段才震，走 lib/haptics 的 tap', () => {
    expect(queueSource).toContain('stickySegRef.value')
    expect(queueSource).toContain('runOnJS(buzz)()')
    expect(queueSource).toContain("import { tap } from '@/lib/haptics'")
  })

  it('历史清除经过破坏性二次确认', () => {
    expect(queueSource).toContain("title: '清除历史记录？'")
    expect(queueSource).toContain("confirmText: '清除'")
    expect(queueSource).toContain('destructive: true')
  })

  it('fling 退场：除位移门槛外加高速 OR 分支，快扫即退', () => {
    expect(queueSource).toContain('downwardVelocity > 1200 && pullDistance > 20')
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

  it('Tab 已废弃：改为单一竖轴列表（无 pager、无水平切换）', () => {
    expect(queueSource).not.toContain('pagerX.value = withTiming')
    expect(queueSource).not.toContain('styles.pagerTrack')
    expect(queueSource).not.toContain('slideOpacity')
    // 待播单列表仍在 pagerViewport 容器里（名字保留）
    expect(queueSource).toContain('styles.pagerViewport')
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
    // 待播行与历史行共用这一个按钮：历史行走 list 上下文（就是普通曲目）
    expect(queueSource).toContain("context={isHistory ? 'list' : 'upcoming'}")
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
