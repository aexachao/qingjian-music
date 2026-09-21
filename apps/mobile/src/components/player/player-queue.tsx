import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Animated as RNAnimated,
} from 'react-native'
import { useConfirm } from '@/components/confirm-modal'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler'
import ReorderableList, { useIsActive, useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list'
import * as Haptics from 'expo-haptics'
import { tap } from '@/lib/haptics'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import type { QueueItem, PlayMode } from '@qj/core-domain'
import { Icon, IconButton, iconSize, type IconName } from '@/components/icon'
import { TrackMenuButton } from '@/components/track-menu-button'
import { isGlobalMenuInteracting } from '@/lib/menu-guard'
import { useServerSession } from '@/lib/server-session'
import {
  clearHistory,
  removeHistoryItem,
  clearUpcoming,
  cycleRepeat,
  extendWithRadio,
  fillRadio,
  moveInQueue,
  playHistoryItem,
  RADIO_UPCOMING_KEEP,
  removeFromQueue,
  setShuffledOrder,
  skipToIndex,
  togglePlay,
} from '@/player/controller'
import { useIsPlaying } from 'react-native-track-player'
import { CoverImage } from '@/components/cover-image'
import { CoverBackdrop } from './cover-backdrop'
import { usePlayerStore } from '@/player/store'
import {
  queueAxisRows,
  queueAxisView,
} from '@/lib/queue-axis-policy'
import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { useToggleFavorite } from '@/lib/favorites'
import { DeckMoreButton } from '@/components/player/player-deck'

const LONG_PRESS_MS = 350
const TAP_SLOP = 12
const RADIO_FETCH_MORE = 10

// 互斥的左滑删除引用
let openSwipeableRef: Swipeable | null = null

export const closeOpenQueueAction = (): boolean => {
  if (!openSwipeableRef) return false
  openSwipeableRef.close()
  openSwipeableRef = null
  return true
}


export function PlayerQueue({
  bottomSpace,
  listAnim,
  stageTopOffset: propStageTopOffset,
  stageHeight: propStageHeight,
  onTopStateChange,
  onActionOpenChange,
  onDismissWithAction,
  onMenuOpenChange,
  isMenuOpen = false,
  createDismissPan,
  cardDismissGesture,
  translateY,
  onDismiss,
}: {
  bottomSpace: number
  listAnim?: SharedValue<number>
  stageTopOffset?: number
  stageHeight?: SharedValue<number>
  onTopStateChange?: (atTop: boolean) => void
  onActionOpenChange?: (open: boolean) => void
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
  isMenuOpen?: boolean
  createDismissPan?: (enabled: boolean) => PanGesture
  cardDismissGesture?: PanGesture
  translateY?: SharedValue<number>
  onDismiss?: () => void
}) {
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const stageTopOffset = propStageTopOffset ?? (insets.top + spacing.sm + 50 + spacing.xs)
  const [containerHeight, setContainerHeight] = useState(0)
  const queueViewportHeight = containerHeight || propStageHeight?.value || 350

  const { provider, connection } = useServerSession()
  const queue = usePlayerStore((state) => state.queue)
  const history = usePlayerStore((state) => state.history)
  const index = usePlayerStore((state) => state.index)
  const playMode = usePlayerStore((state) => state.playMode)
  const autoplay = usePlayerStore((state) => state.autoplay)
  const { playing: isGloballyPlaying } = useIsPlaying()
  const confirm = useConfirm()

  const setQueueActionOpen = useCallback((open: boolean) => {
    onActionOpenChange?.(open)
  }, [onActionOpenChange])

  // 竖轴视图：历史（倒序、上限 50）/ 正在播放 / 待播 —— 见 queue-axis-policy.ts
  const axis = useMemo(() => queueAxisView(history, queue, index), [history, queue, index])
  const { historyRows, upcomingRows } = useMemo(
    () => queueAxisRows(axis, index),
    [axis, index],
  )

  const currentItem = queue[index]
  // 竖轴布局常量（pt）
  const ROW_H = 56
  const CARD_H = 88            // 正在播放卡
  const TOOLBAR_H = 72         // 随机/循环/无限 工具栏
  const HISTORY_TITLE_H = 40   // 历史小标题栏
  // 历史区内容高（倒序行 + 小标题）；初始滚动定位到这里，让正在播放落在视口顶部
  const historyCount = axis.history.length
  const historyBlockH = currentItem ? (historyCount * ROW_H + HISTORY_TITLE_H) : 0
  const modesContentOffset = currentItem ? CARD_H : 0
  const scrollY = useSharedValue(0)
  const isAtTopRef = useSharedValue(true)
  const [isAtTop, setIsAtTop] = useState(true)
  const isDismissing = useSharedValue(false)
  const isDraggingRef = useSharedValue(false)
  const dragStartedAtTopRef = useSharedValue(false)
  // 分段吸顶震动：记上一帧处于哪一段，跨段才震（避免持续震）
  const stickySegRef = useSharedValue(1) // 0=历史 1=正在播放（默认） 2=工具栏

  const buzz = useCallback(() => {
    tap()
  }, [])

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
      if (!isDismissing.value) {
        const isTop = event.contentOffset.y <= 2
        if (isTop !== isAtTopRef.value) {
          isAtTopRef.value = isTop
          runOnJS(setIsAtTop)(isTop)
          if (onTopStateChange) {
            runOnJS(onTopStateChange)(isTop)
          }
        }
      }

      // 分段吸顶震动：跨过阀值才震（历史小标题吸顶于 historyBlockH；工具栏吸顶于 historyBlockH+CARD_H）
      if (currentItem) {
        const y = event.contentOffset.y
        const seg = y >= historyBlockH + CARD_H ? 2 : y >= historyBlockH - 2 ? 1 : 0
        if (seg !== stickySegRef.value) {
          stickySegRef.value = seg
          runOnJS(buzz)()
        }
      }

      // 仅当手势是在列表最顶部（正在播放内容块已吸顶）时发起，才联动全屏模态框下移
      // 若在列表下方（循环工具栏吸顶时）向下拉，播放器页面不动，专心执行列表内部滚动与回弹
      if (translateY && !isDismissing.value && !isDraggingRef.value && dragStartedAtTopRef.value) {
        if (event.contentOffset.y < 0) {
          translateY.value = -event.contentOffset.y
        } else if (translateY.value > 0) {
          translateY.value = 0
        }
      }
    },
    onBeginDrag: (event) => {
      isDismissing.value = false
      // 记录手势起点：只有在最顶部（offset <= 1）开始拉动才算全屏下拉退场手势
      dragStartedAtTopRef.value = event.contentOffset.y <= 1
    },
    onEndDrag: (event) => {
      // 若非顶部发起的手势、拖拽中、菜单打开，绝不触发退场，确保列表自然回弹吸顶
      if (!translateY || isDismissing.value || isDraggingRef.value || isMenuOpen || !dragStartedAtTopRef.value) {
        return
      }

      const pullDistance = -event.contentOffset.y
      if (pullDistance > 0) {
        // 退场终点必须使用全屏幕高度（使模态框完全滑出屏幕下方），不可使用 stage 容器高度（~380pt）
        const exitTargetY = (screenHeight || 850) + 100
        // 将 iOS UIScrollView 速度（pt/ms，向下拉为负）转换为 pt/s，完全对齐播放页 PanGesture 的 velocityY
        const downwardVelocity = -(event.velocity?.y ?? 0) * 1000
        // 动量投射：结合当前位移与松手瞬时速度（与播放页完全一致的 Apple 物理法则）
        const projectedY = pullDistance + downwardVelocity * 0.15
        const dismissThreshold = 150
        const shouldDismiss =
          (projectedY > dismissThreshold && pullDistance > 60) ||
          (pullDistance > 180) ||
          // fling：快速下扫，位移过 20 就退（阀值真机可调）
          (downwardVelocity > 1200 && pullDistance > 20)

        if (shouldDismiss && downwardVelocity > -200) {
          isDismissing.value = true
          translateY.value = withTiming(
            exitTargetY,
            {
              duration: 450,
              easing: Easing.bezier(0.25, 1, 0.5, 1),
            },
            (finished) => {
              if (finished) {
                if (onDismiss) {
                  runOnJS(onDismiss)()
                }
              } else {
                isDismissing.value = false
              }
            }
          )
        } else {
          // 未达退场阈值：与播放页完全一致的 420ms 贝塞尔弹性回弹曲线
          translateY.value = withTiming(0, {
            duration: 420,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
          })
        }
      }
    },
    onMomentumEnd: () => {
      if (translateY && !isDismissing.value && translateY.value > 0) {
        translateY.value = withTiming(0, { duration: 200 })
      }
    },
  })

  const onIndexChange = useCallback((_: any) => {
    'worklet'
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const onToggleAutoplay = useCallback(() => {
    const next = !autoplay
    usePlayerStore.getState().setAutoplay(next)
    if (!next || !provider || !connection) return
    const state = usePlayerStore.getState()
    if (state.queue.length - 1 > RADIO_UPCOMING_KEEP) return
    void extendWithRadio(provider, connection.id).catch(() => {})
  }, [autoplay, connection, provider])

  // 空状态高度：舞台净高 - 工具栏高
  const minContentHeight = useMemo(() => {
    return Math.max(160, queueViewportHeight - TOOLBAR_H)
  }, [queueViewportHeight, TOOLBAR_H])

  // 列表最小高：留出向上滑把卡+工具栏推走、工具栏吸顶的行程
  const minListHeight = useMemo(() => {
    return queueViewportHeight + historyBlockH + CARD_H
  }, [queueViewportHeight, historyBlockH, CARD_H])

  // 待播行高：ListHeader（历史块 + 卡 + 工具栏）之后，每行 56
  const listHeaderH = historyBlockH + CARD_H + TOOLBAR_H
  const getUpcomingItemLayout = useCallback((_: any, itemIndex: number) => {
    const isSingleEmpty = upcomingRows[0]?.kind === 'upcomingEmpty'
    const length = isSingleEmpty ? minContentHeight : ROW_H
    const offset = listHeaderH + itemIndex * ROW_H
    return { length, offset, index: itemIndex }
  }, [listHeaderH, minContentHeight, upcomingRows, ROW_H])

  const upcomingListRef = useRef<FlatList<any>>(null)

  const fillingRef = useRef(false)
  const onEndReached = useCallback(() => {
    if (!provider || !connection) return
    const { source: src, queue: list } = usePlayerStore.getState()
    const upcoming = list.length - 1
    if (src?.kind === 'radio' && autoplay) {
      if (fillingRef.current) return
      fillingRef.current = true
      void fillRadio(provider, connection.id, upcoming + RADIO_FETCH_MORE)
        .catch(() => {})
        .finally(() => { fillingRef.current = false })
    } else if (autoplay && upcoming <= RADIO_UPCOMING_KEEP) {
      void extendWithRadio(provider, connection.id).catch(() => {})
    }
  }, [autoplay, connection, provider])

  const onReorder = useCallback(({ from, to }: ReorderableListReorderEvent) => {
    void moveInQueue(from + 1, to + 1)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const [dragging, setDragging] = useState(false)
  const onDragStart = useCallback(() => {
    'worklet'
    isDraggingRef.value = true
    runOnJS(setDragging)(true)
    runOnJS(closeOpenQueueAction)()
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy)
  }, [isDraggingRef])

  const onDragEnd = useCallback(() => {
    'worklet'
    isDraggingRef.value = false
    runOnJS(setDragging)(false)
  }, [isDraggingRef])

  useEffect(() => {
    onTopStateChange?.(true)
    return () => {
      closeOpenQueueAction()
      onActionOpenChange?.(false)
    }
  }, [onActionOpenChange, onTopStateChange])

  const consumeOpenAction = useCallback(() => {
    const consumed = closeOpenQueueAction()
    if (consumed) setQueueActionOpen(false)
    return consumed
  }, [setQueueActionOpen])

  // 初始定位：挂载/历史块高度变化时，把滚动位置跳到「正在播放」（= 历史块高），
  // 让正在播放落在视口顶部；历史在上方（下拉才露）、待播在下方（默认可见）。
  const didInitialScroll = useRef(false)
  useEffect(() => {
    // 只在首次有了正在播放且历史块高已知时定位一次（之后不抢用户滚动）
    if (didInitialScroll.current || !currentItem) return
    didInitialScroll.current = true
    if (historyBlockH > 0) {
      requestAnimationFrame(() => {
        upcomingListRef.current?.scrollToOffset({ offset: historyBlockH, animated: false })
        scrollY.value = historyBlockH
      })
    }
  }, [currentItem, historyBlockH, scrollY])

  const confirmClearHistory = useCallback(() => {
    if (consumeOpenAction()) return
    confirm({
      title: '清除历史记录？',
      message: '清除后历史播放记录将无法恢复。',
      confirmText: '清除',
      destructive: true,
      onConfirm: () => void clearHistory(),
    })
  }, [confirm, consumeOpenAction])

  const confirmClearUpcoming = useCallback(() => {
    if (consumeOpenAction()) return
    confirm({
      title: '清空待播列表？',
      message: '正在播放的歌曲不受影响，之后的待播歌曲将被移除。',
      confirmText: '清空',
      destructive: true,
      onConfirm: () => void clearUpcoming(),
    })
  }, [confirm, consumeOpenAction])

  const rowAnimatedStyle = useAnimatedStyle(() => {
    // 仅当手势是在列表最顶部（已吸顶）发起全屏下拉退场时，反向补偿列表项 translateY，
    // 抵消 iOS UIScrollView 原生橡皮筋内部下移，让列表与顶底周边在模态框内纹丝不动，作为一整块刚体同步下滑；
    // 而若手势是从列表下方向上滑到顶部（dragStartedAtTopRef 为 false），不进行补偿，保留自然原生的到顶回弹吸顶动画。
    if (dragStartedAtTopRef.value && scrollY.value < 0) {
      return {
        transform: [{ translateY: scrollY.value }],
      }
    }
    return {
      transform: [{ translateY: 0 }],
    }
  })

  /**
   * 待播行数。待播列表就是 `queue.slice(1)`（当前曲目恒在 index 0），
   * 所以这里用 `queue.length - 1` 作为唯一定义，别处不要再各自算一遍。
   */
  const upcomingCount = Math.max(0, queue.length - 1)

  const renderUpcomingItem = useCallback(({ item }: { item: import('@/lib/queue-axis-policy').QueueAxisRow; index: number }) => {
    if (item.kind === 'upcomingEmpty') {
      return (
        <Animated.View style={rowAnimatedStyle}>
          <QueueEmptyState
            title="队列已播完"
            description="可在音乐库中点播歌曲，或开启上方无限播放"
            action={!autoplay && provider ? { label: '开启无限播放', onPress: onToggleAutoplay } : undefined}
            minHeight={minContentHeight}
            scrollY={scrollY}
          />
        </Animated.View>
      )
    }
    if (item.kind !== 'upcoming') return null

    return (
      <Animated.View style={rowAnimatedStyle}>
        <QueueRow 
          item={item.item} 
          queueIndex={item.queueIndex} 
          upcomingCount={upcomingCount}
          playing={false} 
          isGloballyPlaying={!!isGloballyPlaying}
          isHistory={false}
          onSelect={() => void skipToIndex(item.queueIndex)}
          swipeEnabled={!dragging}
          onActionOpenChange={setQueueActionOpen}
        />
      </Animated.View>
    )
  }, [autoplay, dragging, isGloballyPlaying, minContentHeight, onToggleAutoplay, provider, rowAnimatedStyle, scrollY, setQueueActionOpen, upcomingCount])

  // 历史行（非拖拽，渲在 ListHeader 里）。倒序：数组末尾=最近（上一首），贴着正在播放。
  const renderHistoryRow = useCallback((row: import('@/lib/queue-axis-policy').QueueAxisRow) => {
    if (row.kind === 'historyEmpty') {
      return (
        <View key={row.key} style={{ height: 0 }} />
      )
    }
    if (row.kind !== 'history') return null
    return (
      <QueueRow
        key={row.key}
        item={row.item}
        queueIndex={-1}
        upcomingCount={0}
        playing={false}
        isGloballyPlaying={!!isGloballyPlaying}
        isHistory
        onSelect={() => void playHistoryItem(row.item)}
        swipeEnabled={!dragging}
        onActionOpenChange={setQueueActionOpen}
      />
    )
  }, [dragging, isGloballyPlaying, setQueueActionOpen])

  const isDismissEnabled = !isMenuOpen && !dragging && isAtTop

  const headerOverlayDismissGesture = useMemo(
    () => (createDismissPan ? createDismissPan(isDismissEnabled) : cardDismissGesture),
    [createDismissPan, isDismissEnabled, cardDismissGesture]
  )

  const headerAnimatedStyle = useAnimatedStyle(() => {
    // 竖轴：以「历史块高 historyBlockH」为基准。
    // 滚到 historyBlockH 时卡落在顶部；继续往上滑（scrollY > historyBlockH）把卡推走、工具栏吸顶（上移最多 CARD_H）；
    // 往下滑（scrollY < historyBlockH）卡不再上移（保持顶部），历史在下方逐渐露出。
    const past = scrollY.value - historyBlockH
    const maxShift = currentItem ? CARD_H : 0
    const translateY = past <= 0 ? 0 : -Math.min(maxShift, past)
    return {
      transform: [{ translateY }],
    }
  })

  const hasUpcomingTracks = queue.length > 1

  const listHeader = (
    <View>
      {/* 历史区（倒序、上限 50、不可拖拽）：数组末尾=最近（上一首），贴着下方的正在播放 */}
      {currentItem && historyCount > 0 ? (
        <>
          {historyRows.map((row) => renderHistoryRow(row))}
          <View style={styles.historyTitleBar}>
            <Text style={styles.historyTitleText}>历史记录</Text>
            <Pressable onPress={confirmClearHistory} hitSlop={8} accessibilityRole="button" accessibilityLabel="清除历史记录">
              <Text style={styles.listClear}>清除</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      {/* 占位：正在播放卡 + 工具栏（实体在悬浮 overlay 里） */}
      <View style={{ height: (currentItem ? CARD_H : 0) + TOOLBAR_H }} />
      {/* 待播小标题栏（带清空） */}
      {upcomingCount > 0 ? (
        <View style={styles.historyTitleBar}>
          <Text style={styles.historyTitleText}>待播</Text>
          <Pressable onPress={confirmClearUpcoming} hitSlop={8} accessibilityRole="button" accessibilityLabel="清空待播列表">
            <Text style={styles.listClear}>清空</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )

  return (
    <View
      style={[styles.container, { paddingBottom: bottomSpace }]}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <Animated.View style={[styles.headerOverlay, headerAnimatedStyle]} pointerEvents="box-none">
        {headerOverlayDismissGesture ? (
          <GestureDetector gesture={headerOverlayDismissGesture}>
            <View>
              {currentItem ? (
                <CurrentTrackCard
                  item={currentItem}
                  listAnim={listAnim}
                  consumeOpenAction={consumeOpenAction}
                  onDismissWithAction={onDismissWithAction}
                  onMenuOpenChange={onMenuOpenChange}
                />
              ) : null}
              <ModesHeader
                artwork={queue[index]?.artwork}
                stageTopOffset={stageTopOffset}
                modesContentOffset={modesContentOffset}
                scrollY={scrollY}
                screenWidth={screenWidth}
                screenHeight={screenHeight}
                playMode={playMode}
                autoplay={autoplay}
                provider={provider}
                consumeOpenAction={consumeOpenAction}
                onToggleAutoplay={onToggleAutoplay}
              />
            </View>
          </GestureDetector>
        ) : (
          <View>
            {currentItem ? (
              <CurrentTrackCard
                item={currentItem}
                listAnim={listAnim}
                consumeOpenAction={consumeOpenAction}
                onDismissWithAction={onDismissWithAction}
                onMenuOpenChange={onMenuOpenChange}
              />
            ) : null}
            <ModesHeader
              artwork={queue[index]?.artwork}
              stageTopOffset={stageTopOffset}
              modesContentOffset={modesContentOffset}
              scrollY={scrollY}
              screenWidth={screenWidth}
              screenHeight={screenHeight}
              playMode={playMode}
              autoplay={autoplay}
              provider={provider}
              consumeOpenAction={consumeOpenAction}
              onToggleAutoplay={onToggleAutoplay}
            />
          </View>
        )}
      </Animated.View>

      <View style={styles.pagerViewport}>
        <ReorderableList
          ref={upcomingListRef as any}
          data={upcomingRows}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.list, { minHeight: minListHeight }]}
          onReorder={onReorder}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          panActivateAfterLongPress={LONG_PRESS_MS}
          dragEnabled={hasUpcomingTracks}
          getItemLayout={getUpcomingItemLayout}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={5}
          onScroll={scrollHandler}
          onScrollBeginDrag={() => {
            if (closeOpenQueueAction()) setQueueActionOpen(false)
          }}
          shouldUpdateActiveItem={true}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onIndexChange={onIndexChange}
          cellAnimations={{ transform: [] }}
          renderItem={renderUpcomingItem}
          bounces={true}
          alwaysBounceVertical={true}
          decelerationRate="normal"
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  )
}

export function CurrentTrackCard({
  item,
  consumeOpenAction = () => false,
  onDismissWithAction,
  onMenuOpenChange,
}: {
  item: QueueItem
  listAnim?: SharedValue<number>
  consumeOpenAction?: () => boolean
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
}) {
  const colors = useThemeColors()
  const styles = useStyles()
  const toggleFavorite = useToggleFavorite()

  return (
    <View style={styles.currentCard}>
      <CoverImage resource={item.artwork} size={64} borderRadius={radius.md} />
      <View style={styles.currentInfo}>
        <Text style={styles.currentTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.currentArtist} numberOfLines={1}>{item.artistText}</Text>
      </View>
      <View style={styles.currentActions}>
        <IconButton
          name="heart"
          size={iconSize.lg}
          color={item.isFavorite ? colors.like : colors.iconMid}
          filled={true}
          onPress={() => {
            if (consumeOpenAction()) return
            void toggleFavorite(item.trackId, !item.isFavorite)
          }}
          accessibilityLabel={item.isFavorite ? '取消喜欢' : '喜欢'}
        />
        <DeckMoreButton
          current={item}
          onBeforeOpen={consumeOpenAction}
          onDismissWithAction={onDismissWithAction}
          onMenuOpenChange={onMenuOpenChange}
          popDirection="down"
        />
      </View>
    </View>
  )
}

function ModesHeader({
  artwork,
  stageTopOffset,
  modesContentOffset,
  scrollY,
  screenWidth,
  screenHeight,
  playMode,
  autoplay,
  provider,
  consumeOpenAction,
  onToggleAutoplay,
}: {
  artwork?: any
  stageTopOffset: number
  modesContentOffset: number
  scrollY: SharedValue<number>
  screenWidth: number
  screenHeight: number
  playMode: PlayMode
  autoplay: boolean
  provider: any
  consumeOpenAction: () => boolean
  onToggleAutoplay: () => void
}) {
  const styles = useStyles()

  const bgStyle = useAnimatedStyle(() => {
    const currentScreenY = stageTopOffset + Math.max(0, modesContentOffset - scrollY.value)
    return {
      transform: [{ translateY: -currentScreenY }],
    }
  })

  const bgContainerStyle = useAnimatedStyle(() => {
    // scrollY == 0 时背景透明（完全显示屏幕根背景，0色差）；滚动吸顶过程中淡入到 1，遮挡下方滚动上来的歌曲
    const opacity = interpolate(scrollY.value, [0, modesContentOffset], [0, 1], Extrapolation.CLAMP)
    return { opacity }
  })

  return (
    <View style={styles.modesHeader}>
      <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, bgContainerStyle]} pointerEvents="none">
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: screenWidth,
              height: screenHeight,
            },
            bgStyle,
          ]}
        >
          <CoverBackdrop artwork={artwork} />
        </Animated.View>
      </Animated.View>
      <View style={styles.modes}>
        <ModeButton
          icon="shuffle"
          label="随机播放"
          active={playMode.shuffle}
          onPress={() => {
            if (consumeOpenAction()) return
            void setShuffledOrder(!playMode.shuffle)
          }}
        />
        <ModeButton
          icon={playMode.repeat === 'one' ? 'repeatOne' : 'repeat'}
          label={playMode.repeat === 'one' ? '单曲循环' : playMode.repeat === 'queue' ? '列表循环' : '顺序播放'}
          active={playMode.repeat !== 'off'}
          onPress={() => {
            if (consumeOpenAction()) return
            void cycleRepeat()
          }}
        />
        {provider?.capabilities.radio ? (
          <ModeButton
            icon="infinity"
            label="无限播放"
            active={autoplay}
            onPress={() => {
              if (consumeOpenAction()) return
              onToggleAutoplay()
            }}
          />
        ) : null}
      </View>
    </View>
  )
}

function ModeButton({ icon, label, active, onPress }: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  const colors = useThemeColors()
  const styles = useStyles()
  return (
    <Pressable
      onPress={onPress}
      style={[styles.mode, active && styles.modeActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `${label}（已开启）` : label}
    >
      <Icon name={icon} size={iconSize.lg} color={active ? colors.bgPrimary : colors.textSecondary} />
    </Pressable>
  )
}

export interface EmptyStateAction {
  label: string
  onPress: () => void
}

export interface QueueEmptyStateProps {
  title: string
  description?: string
  action?: EmptyStateAction
  minHeight?: number
  scrollY?: SharedValue<number>
}

export function QueueEmptyState({
  title,
  description,
  action,
  minHeight,
  scrollY,
}: QueueEmptyStateProps) {
  const styles = useStyles()
  const animatedStyle = useAnimatedStyle(() => {
    // 动态垂直居中：根据上方循环工具栏是否吸顶，动态计算 list 视口高度并垂直居中
    // scrollY == 0（未吸顶）：视口为 stageHeight - 194，相对于容器（stageHeight - 106）向上偏移 44pt
    // scrollY >= 88（吸顶）：视口为 stageHeight - 106，无偏移（正好居中）
    const currentScrollY = scrollY ? Math.min(88, Math.max(0, scrollY.value)) : 0
    const shiftY = -(88 - currentScrollY) / 2
    return {
      transform: [
        { translateY: shiftY },
      ],
    }
  })

  return (
    <View
      style={[
        styles.emptyStateContainer,
        minHeight !== undefined && { height: minHeight },
      ]}
    >
      <Animated.View style={[styles.emptyStateContent, animatedStyle]}>
        <Text style={styles.emptyStateTitle}>{title}</Text>
        {description ? <Text style={styles.emptyStateSubtitle}>{description}</Text> : null}
        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={8}
            style={({ pressed }) => [styles.emptyStateButton, pressed && styles.emptyStateButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={styles.emptyStateButtonText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  )
}

function QueueRow(props: {
  item: QueueItem
  queueIndex: number
  upcomingCount: number
  playing: boolean
  isGloballyPlaying: boolean
  isHistory: boolean
  onSelect: () => void
  swipeEnabled: boolean
  onActionOpenChange?: (open: boolean) => void
}) {
  // 历史行渲在 ListHeader 里（不在 ReorderableList cell 上下文），不能调 useReorderableDrag/useIsActive；
  // 只有待播行（isHistory=false）才走可拖拽版本。
  if (props.isHistory) return <QueueRowInner {...props} isActive={false} drag={NOOP_DRAG} />
  return <QueueRowDraggable {...props} />
}

const NOOP_DRAG = () => {}

/** 待播行：在 ReorderableList cell 上下文里取 drag/isActive，再交给 Inner */
function QueueRowDraggable(props: {
  item: QueueItem
  queueIndex: number
  upcomingCount: number
  playing: boolean
  isGloballyPlaying: boolean
  isHistory: boolean
  onSelect: () => void
  swipeEnabled: boolean
  onActionOpenChange?: (open: boolean) => void
}) {
  const isActive = useIsActive()
  const drag = useReorderableDrag()
  return <QueueRowInner {...props} isActive={isActive} drag={drag} />
}

function QueueRowInner({
  item,
  queueIndex,
  upcomingCount,
  playing,
  isGloballyPlaying,
  isHistory,
  onSelect,
  swipeEnabled,
  onActionOpenChange,
  isActive,
  drag,
}: {
  item: QueueItem
  queueIndex: number
  /** 待播行总数（不含当前曲目），用于判断「已经在队尾」 */
  upcomingCount: number
  playing: boolean
  isGloballyPlaying: boolean
  isHistory: boolean
  onSelect: () => void
  swipeEnabled: boolean
  onActionOpenChange?: (open: boolean) => void
  isActive: boolean
  drag: () => void
}) {
  const colors = useThemeColors()
  const styles = useStyles()
  const elevation = useSharedValue(0)

  useEffect(() => {
    elevation.value = withTiming(isActive ? 8 : 0)
  }, [isActive, elevation])

  const animatedStyle = useAnimatedStyle(() => {
    return {
      elevation: elevation.value,
      shadowOpacity: elevation.value / 20,
      shadowRadius: elevation.value * 2,
      shadowOffset: { width: 0, height: elevation.value },
      zIndex: isActive ? 100 : 0,
      backgroundColor: isActive ? colors.bgListItemActive : 'transparent',
      borderRadius: isActive ? radius.md : 0,
    }
  }, [colors.bgListItemActive, isActive, elevation])
  const startX = useRef(0)
  const startY = useRef(0)
  const moved = useRef(false)
  const [dragHandlePressed, setDragHandlePressed] = useState(false)
  const dismissedSwipeOnHandlePress = useRef(false)
  const swipeableRef = useRef<Swipeable>(null)

  useEffect(() => () => {
    if (openSwipeableRef === swipeableRef.current) {
      openSwipeableRef = null
      onActionOpenChange?.(false)
    }
  }, [onActionOpenChange])

  const renderRightActions = (progress: any, dragX: any) => {
    const trans = dragX.interpolate({ inputRange: [-80, 0], outputRange: [0, 80], extrapolate: 'clamp' });
    return (
      <RNAnimated.View style={{ transform: [{ translateX: trans }] }}>
        <Pressable
          style={styles.deleteAction}
          onPress={() => void (isHistory ? removeHistoryItem(item.qid) : removeFromQueue(queueIndex))}
          accessibilityRole="button"
          accessibilityLabel={isHistory ? `删除历史记录 ${item.title}` : `从队列移除 ${item.title}`}
        >
          <View style={styles.deleteIconBg}>
            <Icon name="remove" size={20} color={colors.danger} />
          </View>
        </Pressable>
      </RNAnimated.View>
    )
  }

  const onSwipeableWillOpen = () => {
    if (openSwipeableRef && openSwipeableRef !== swipeableRef.current) {
      closeOpenQueueAction()
    }
    openSwipeableRef = swipeableRef.current
    onActionOpenChange?.(true)
  }

  const onSwipeableClose = () => {
    if (openSwipeableRef !== swipeableRef.current) return
    openSwipeableRef = null
    onActionOpenChange?.(false)
  }


  const content = (
    <Animated.View style={animatedStyle}>
    {/*
      左右物理隔离：主触控区（点按播放）与右侧控件区（播放键 / 「···」菜单 / 拖动把手）
      是兄弟节点而非嵌套，避免「···」的点击被外层 Pressable 抢走。
      与 PagedTrackCarousel / TrackRow 的规范一致。
    */}
    <View style={styles.rowWrapper}>
      <Pressable
        onTouchStart={(event) => {
          startX.current = event.nativeEvent.pageX
          startY.current = event.nativeEvent.pageY
          moved.current = false
        }}
        onTouchMove={(event) => {
          const { pageX, pageY } = event.nativeEvent
          if (Math.abs(pageX - startX.current) > TAP_SLOP || Math.abs(pageY - startY.current) > TAP_SLOP) {
            moved.current = true
          }
        }}
        onPress={() => {
          if (moved.current) return
          // 菜单刚关闭的 450ms 冷却期内不响应，否则「点空白处关菜单」会顺手切歌
          if (isGlobalMenuInteracting()) return
          if (closeOpenQueueAction()) return
          onSelect()
        }}
        style={styles.rowMain}
        accessibilityRole="button"
        accessibilityLabel={`播放 ${item.title}，${item.artistText}`}
      >
        <CoverImage resource={item.artwork} size={48} borderRadius={radius.sm} />
        <View style={styles.rowText}>
          <View style={styles.rowTitleLine}>
            <Text style={[styles.rowTitle]} numberOfLines={1}>{item.title}</Text>
          </View>
          <Text style={styles.rowMeta} numberOfLines={1}>{item.artistText}</Text>
        </View>
      </Pressable>

      <View style={styles.rowRight}>
        {!isHistory && playing ? (
          <IconButton
            name={isGloballyPlaying ? 'pause' : 'play'}
            size={iconSize.md}
            color={colors.bgPrimary}
            style={styles.playingIconBg}
            onPress={() => void togglePlay()}
            accessibilityLabel={isGloballyPlaying ? '暂停' : '播放'}
          />
        ) : null}

        {/*
          两种模式共用这一个菜单按钮：
          · 待播行 → `upcoming` 上下文，操作按队列下标走；
          · 历史行 → `list` 上下文（就是普通曲目），并把 `QueueItem.track` 传下去，
            有完整曲目才有「下一首播放 / 加入队列」，没有就自动少这两条（不摆假条目）。
        */}
        <TrackMenuButton
          context={isHistory ? 'list' : 'upcoming'}
          color={colors.iconDim}
          title=""
          accessibilityLabel={`${item.title} 的更多操作`}
          // 打开菜单前先收起已展开的左滑删除，避免两层操作面同时存在。
          // 刻意不接 onMenuOpenChange：那是给播放页挂全屏拦截遮罩用的，
          // 原生菜单自带窗口与点击外部关闭，再叠一层 RN 遮罩会白吞一次点击。
          onBeforeOpen={() => {
            closeOpenQueueAction()
          }}
          subject={{
            trackId: item.trackId,
            title: item.title,
            artistText: item.artistText,
            ...(item.albumId ? { albumId: item.albumId } : {}),
            ...(item.albumText ? { albumText: item.albumText } : {}),
            ...(item.artistId ? { artistId: item.artistId } : {}),
            durationMs: item.durationMs,
            ...(item.coverId ? { coverId: item.coverId } : {}),
            ...(item.isFavorite === undefined ? {} : { isFavorite: item.isFavorite }),
            ...(isHistory
              ? {
                  isHistory: true,
                  qid: item.qid,
                  ...(item.track ? { track: item.track } : {}),
                }
              : { queueIndex, upcomingCount }),
          }}
        />

        {!isHistory && (
          <Pressable
            onPressIn={() => {
              dismissedSwipeOnHandlePress.current = closeOpenQueueAction()
              if (dismissedSwipeOnHandlePress.current) onActionOpenChange?.(false)
            }}
            onLongPress={() => {
              if (dismissedSwipeOnHandlePress.current) return
              setDragHandlePressed(true)
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              drag()
            }}
            delayLongPress={LONG_PRESS_MS}
            onPressOut={() => {
              dismissedSwipeOnHandlePress.current = false
              setDragHandlePressed(false)
            }}
            // 只向上下与右侧扩：左边紧挨着「···」按钮，左扩 16pt 会把按钮右半边变成死区
            // （把手只有按下/长按，没有点击，那块区域点了不会有任何反应）
            hitSlop={{ top: 14, bottom: 14, right: 16 }}
            style={styles.dragSlot}
            accessibilityRole="button"
            accessibilityLabel="拖动排序"
          >
            <Icon name="drag" size={20} color={colors.iconDim} />
          </Pressable>
        )}
      </View>
    </View>
    </Animated.View>
  )

  // 两种模式都要左滑删除：待播行删队列、历史行删这条历史
  return (
    <Swipeable 
      ref={swipeableRef}
      enabled={swipeEnabled && !dragHandlePressed}
      dragOffsetFromRightEdge={20}
      renderRightActions={renderRightActions} 
      overshootRight={false}
      friction={2}
      overshootFriction={8} 
      containerStyle={{ overflow: 'visible' }}
      onSwipeableWillOpen={onSwipeableWillOpen}
      onSwipeableClose={onSwipeableClose}
    >
      {content}
    </Swipeable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: { flex: 1, overflow: 'hidden' },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  pagerViewport: {
    flex: 1,
  },
  list: { paddingBottom: spacing.xxl + spacing.md },
  empty: { ...typography.callout, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  
  modesHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  modes: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: spacing.lg,
  },
  mode: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.bgButtonSecondary,
  },
  modeActive: { backgroundColor: colors.textPrimary },

  listClear: { ...typography.callout, color: colors.iconMid },
  historyTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    height: 40,
  },
  historyTitleText: { ...typography.subhead, fontWeight: '600', color: colors.textSecondary },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyStateContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  emptyStateTitle: {
    ...typography.subhead,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyStateButton: {
    marginTop: spacing.sm,
    height: 32,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateButtonPressed: {
    backgroundColor: colors.bgCardHover,
  },
  emptyStateButtonText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },

  currentCard: {
    height: 88,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
    overflow: 'hidden',
  },
  currentInfo: { flex: 1, justifyContent: 'center' },
  currentTitle: { ...typography.title, color: colors.textPrimary },
  currentArtist: { ...typography.callout, color: colors.textSecondary, marginTop: 2 },
  currentActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  // 待播行：主触控区与右侧控件区是兄弟节点，物理隔离事件
  rowWrapper: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  rowMain: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: { flex: 1, gap: 2, justifyContent: 'center' },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowTitle: { ...typography.callout, color: colors.textPrimary, flexShrink: 1 },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  
  deleteAction: { backgroundColor: colors.danger || 'red', justifyContent: 'center', alignItems: 'center', width: 80, height: '100%' },
  deleteIconBg: { backgroundColor: colors.textOnAccent, borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  dragSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playingIconBg: { backgroundColor: colors.textPrimary, borderRadius: radius.pill, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
}))
