import { useCallback, useEffect, useRef, useMemo, useState, type ComponentClass, type ComponentProps } from 'react'
import {
  Pressable,
  SectionList,
  Text,
  View,
  useWindowDimensions,
  Animated as RNAnimated,
  type ViewToken,
} from 'react-native'
import { useConfirm } from '@/components/confirm-modal'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import { tap } from '@/lib/haptics'
import Animated, {
  Easing,
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
  playHistoryItem,
  RADIO_UPCOMING_KEEP,
  removeFromQueue,
  setShuffledOrder,
  skipToIndex,
  togglePlay,
} from '@/player/controller'
import { useIsPlaying } from 'react-native-track-player'
import { CoverImage } from '@/components/cover-image'
import { usePlayerStore } from '@/player/store'
import {
  queueAxisView,
  axisSnapOffsets,
  type QueueAxisRow,
  type QueueSectionKind,
} from '@/lib/queue-axis-policy'
import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { useToggleFavorite } from '@/lib/favorites'
import { DeckMoreButton } from '@/components/player/player-deck'

// reanimated 的 useAnimatedScrollHandler 只能给 Animated.* 组件（普通 SectionList 的 onScroll
// 拿到的不是可调用的 handler，会报 Object is not a function）。包一层。
const AnimatedSectionList = Animated.createAnimatedComponent(
  SectionList as unknown as ComponentClass<
    ComponentProps<typeof SectionList<QueueAxisRow, { key: QueueSectionKind; data: QueueAxisRow[] }>>
  >,
)

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
  const { height: screenHeight } = useWindowDimensions()
  void propStageTopOffset

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

  // 三模块竖轴视图（SectionList）：历史 / 正在播放 / 待播 —— 见 queue-axis-policy.ts
  const axis = useMemo(() => queueAxisView(history, queue, index), [history, queue, index])
  // 方案甲：只在「历史顶」与「正在播放顶」两处吸附（待播自由翻）
  const snapOffsets = useMemo(() => axisSnapOffsets(axis), [axis])
  // 初始滚动位置 = 正在播放顶（历史块高）；没历史时为 0。
  // 用 ScrollView 的 contentOffset 初始值定位——比 scrollToLocation 稳（不依赖 ref/测量时机）。
  const initialOffsetY = snapOffsets.length > 1 ? snapOffsets[1]! : 0

  const currentItem = queue[index]
  const scrollY = useSharedValue(0)
  const isAtTopRef = useSharedValue(true)
  const [isAtTop, setIsAtTop] = useState(true)
  const isDismissing = useSharedValue(false)
  const isDraggingRef = useSharedValue(false)
  const dragStartedAtTopRef = useSharedValue(false)

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

      // 分段吸顶震动交给 onViewableItemsChanged（看当前吸顶的是哪个 section），这里不管

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

  const onToggleAutoplay = useCallback(() => {
    const next = !autoplay
    usePlayerStore.getState().setAutoplay(next)
    if (!next || !provider || !connection) return
    const state = usePlayerStore.getState()
    if (state.queue.length - 1 > RADIO_UPCOMING_KEEP) return
    void extendWithRadio(provider, connection.id).catch(() => {})
  }, [autoplay, connection, provider])

  // 空状态高度：舞台净高
  const minContentHeight = useMemo(() => {
    return Math.max(160, queueViewportHeight - 60)
  }, [queueViewportHeight])

  const sectionListRef = useRef<SectionList<QueueAxisRow, { key: QueueSectionKind; data: QueueAxisRow[] }>>(null)

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

  // 分段吸顶震动：当吸顶的 section 变了就震一下（跨段才震，不持续）
  const stickySectionRef = useRef<QueueSectionKind | null>(null)
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    // 第一个可见的 section header 就是当前吸顶的
    if (!viewableItems || viewableItems.length === 0) return
    const topSection = viewableItems.find((v) => v?.section)?.section?.key as QueueSectionKind | undefined
    if (topSection && topSection !== stickySectionRef.current) {
      stickySectionRef.current = topSection
      tap()
    }
  }).current


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

  /**
   * 待播行数。待播列表就是 `queue.slice(1)`（当前曲目恒在 index 0），
   * 所以这里用 `queue.length - 1` 作为唯一定义，别处不要再各自算一遍。
   */
  const upcomingCount = Math.max(0, queue.length - 1)

  const renderRow = useCallback(({ item }: { item: QueueAxisRow }) => {
    if (item.kind === 'current') {
      return (
        <CurrentTrackCard
          item={item.item}
          listAnim={listAnim}
          consumeOpenAction={consumeOpenAction}
          onDismissWithAction={onDismissWithAction}
          onMenuOpenChange={onMenuOpenChange}
        />
      )
    }
    if (item.kind === 'history') {
      return (
        <QueueRow
          item={item.item}
          queueIndex={-1}
          upcomingCount={0}
          playing={false}
          isGloballyPlaying={!!isGloballyPlaying}
          isHistory
          onSelect={() => void playHistoryItem(item.item)}
          swipeEnabled
          onActionOpenChange={setQueueActionOpen}
        />
      )
    }
    if (item.kind === 'upcomingEmpty') {
      return (
        <QueueEmptyState
          title="队列已播完"
          description="可在音乐库中点播歌曲，或开启上方无限播放"
          action={!autoplay && provider ? { label: '开启无限播放', onPress: onToggleAutoplay } : undefined}
          minHeight={minContentHeight}
        />
      )
    }
    // upcoming
    return (
      <QueueRow
        item={item.item}
        queueIndex={item.queueIndex}
        upcomingCount={upcomingCount}
        playing={false}
        isGloballyPlaying={!!isGloballyPlaying}
        isHistory={false}
        onSelect={() => void skipToIndex(item.queueIndex)}
        swipeEnabled
        onActionOpenChange={setQueueActionOpen}
      />
    )
  }, [autoplay, consumeOpenAction, isGloballyPlaying, listAnim, minContentHeight, onDismissWithAction, onMenuOpenChange, onToggleAutoplay, provider, setQueueActionOpen, upcomingCount])

  // section 头：历史 = 「历史记录 + 清除」；正在播放 = 无头（卡本身是唯一的 row）；待播 = 随机工具栏 + 「待播/清空」
  const renderSectionHeader = useCallback(({ section }: { section: { key: QueueSectionKind } }) => {
    if (section.key === 'history') {
      return (
        <View style={styles.stickyHeader}>
          <View style={styles.historyTitleBar}>
            <Text style={styles.historyTitleText}>历史记录</Text>
            <Pressable onPress={confirmClearHistory} hitSlop={8} accessibilityRole="button" accessibilityLabel="清除历史记录">
              <Text style={styles.listClear}>清除</Text>
            </Pressable>
          </View>
        </View>
      )
    }
    if (section.key === 'upcoming') {
      return (
        <View style={styles.stickyHeader}>
          <ModesHeader
            playMode={playMode}
            autoplay={autoplay}
            provider={provider}
            consumeOpenAction={consumeOpenAction}
            onToggleAutoplay={onToggleAutoplay}
          />
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
    }
    // current section 无头：返回 0 高 View（不能返 null——sticky 开关下原生层测量 null header 会偶发崩）
    return <View />
  }, [autoplay, confirmClearHistory, confirmClearUpcoming, consumeOpenAction, onToggleAutoplay, playMode, provider, styles, upcomingCount])

  const isDismissEnabled = !isMenuOpen && isAtTop

  const listDismissGesture = useMemo(
    () => (createDismissPan ? createDismissPan(isDismissEnabled) : cardDismissGesture),
    [createDismissPan, isDismissEnabled, cardDismissGesture]
  )

  const listBody = (
    <AnimatedSectionList
      ref={sectionListRef as any}
      sections={axis.sections}
      keyExtractor={(item) => item.key}
      renderItem={renderRow}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      contentContainerStyle={styles.list}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      onViewableItemsChanged={onViewableItemsChanged}
      onScrollBeginDrag={() => {
        if (closeOpenQueueAction()) setQueueActionOpen(false)
      }}
      onScrollToIndexFailed={() => {}}
      contentOffset={{ x: 0, y: initialOffsetY }}
      {...(snapOffsets.length > 0
        ? { snapToOffsets: snapOffsets, snapToEnd: false, disableIntervalMomentum: true }
        : {})}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      bounces={true}
      alwaysBounceVertical={true}
      decelerationRate="normal"
      showsVerticalScrollIndicator={false}
    />
  )

  return (
    <View
      style={[styles.container, { paddingBottom: bottomSpace }]}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      {listDismissGesture ? (
        <GestureDetector gesture={listDismissGesture}>{listBody}</GestureDetector>
      ) : (
        listBody
      )}
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
  playMode,
  autoplay,
  provider,
  consumeOpenAction,
  onToggleAutoplay,
}: {
  playMode: PlayMode
  autoplay: boolean
  provider: any
  consumeOpenAction: () => boolean
  onToggleAutoplay: () => void
}) {
  const styles = useStyles()

  return (
    <View style={styles.modesHeader}>
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
  // 第13轮改用 SectionList，不再支持拖拽排序（待播排序走「···」菜单），
  // 所以行不再需要 reorderable 上下文的 drag/isActive。
  return <QueueRowInner {...props} isActive={false} drag={NOOP_DRAG} />
}

const NOOP_DRAG = () => {}

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
  
  stickyHeader: {
    backgroundColor: colors.bgPrimary,
  },
  modesHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgPrimary,
  },
  modes: {
    flexDirection: 'row',
    gap: 16,
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
    backgroundColor: colors.bgPrimary,
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
