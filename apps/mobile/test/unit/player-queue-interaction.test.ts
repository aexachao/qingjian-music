import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

const queueSource = readSource('components/player/player-queue.tsx')
const playerSource = readSource('app/player.tsx')

describe('播放器队列竖轴交互', () => {
  it('采用三模块 SectionList：历史/正在播放/待播（已废弃左右 tab pager）', () => {
    expect(queueSource).toContain('queueAxisView(history, queue, index)')
    expect(queueSource).toContain('<AnimatedSectionList')
    expect(queueSource).toContain('createAnimatedComponent')
    expect(queueSource).toContain('stickySectionHeadersEnabled')
    expect(queueSource).not.toContain("useState<QueueTab>")
    expect(queueSource).not.toContain('pagerX.value = withTiming')
  })

  it('三个 section：历史头+行、正在播放（卡作为 row）、待播头（工具栏）+行', () => {
    expect(queueSource).toContain('renderSectionHeader')
    expect(queueSource).toContain('renderItem={renderRow}')
    // 历史头在行上方（sticky）；待播头=随机工具栏
    expect(queueSource).toContain("section.key === 'history'")
    expect(queueSource).toContain("section.key === 'upcoming'")
    expect(queueSource).toContain('<ModesHeader')
  })

  it('初始定位到「正在播放」（contentOffset 初始值 = 历史块高）', () => {
    expect(queueSource).toContain('contentOffset={{ x: 0, y: initialOffsetY }}')
    expect(queueSource).toContain('const initialOffsetY = snapOffsets.length > 1')
  })

  it('分段吸顶震动：吸顶 section 变了才震，走 lib/haptics 的 tap', () => {
    expect(queueSource).toContain('onViewableItemsChanged')
    expect(queueSource).toContain('stickySectionRef')
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

  it('待播行左滑删除保留（SectionList 不支持拖拽排序，排序改走「···」菜单）', () => {
    // 左滑删除仍在（QueueRow 里的 Swipeable）
    expect(queueSource).toContain('renderRightActions')
    // 不再依赖 ReorderableList
    expect(queueSource).not.toContain("from 'react-native-reorderable-list'")
  })

  it('Tab 已废弃：无 pager、无水平切换', () => {
    expect(queueSource).not.toContain('pagerX.value = withTiming')
    expect(queueSource).not.toContain('styles.pagerTrack')
    expect(queueSource).not.toContain('slideOpacity')
  })

  it('列表顶部下拉退出：复用 createDismissPan，包住 SectionList', () => {
    expect(playerSource).toContain('const [isListAtTop, setIsListAtTop] = useState(true)')
    expect(playerSource).toContain("if (mode === 'list') { setIsListAtTop(true)")
    expect(playerSource).toContain('createDismissPan={createDismissPan}')
    expect(playerSource).toContain("mode !== 'list' || isListAtTop")
    expect(queueSource).toContain('bounces={true}')
    expect(queueSource).toContain('alwaysBounceVertical={true}')
    expect(queueSource).toContain('gesture={listDismissGesture}')
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
