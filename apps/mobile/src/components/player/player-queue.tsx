import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Animated as RNAnimated,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import ReorderableList, { useIsActive, useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list'
import * as Haptics from 'expo-haptics'
import Animated, {
  cancelAnimation,
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
import { LivePlayingBars } from '@/components/playing-bars'
import { useServerSession } from '@/lib/server-session'
import {
  clearHistory,
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
import { colors, fonts, radius, spacing, typography } from '@/theme/tokens'
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

type QueueTab = 'upcoming' | 'history'

type UpcomingRowData =
  | { id: string; type: 'upcomingTrack'; item: QueueItem; index: number }
  | { id: string; type: 'emptyState'; tab: QueueTab }

type HistoryRowData =
  | { id: string; type: 'historyTrack'; item: QueueItem; index: number }
  | { id: string; type: 'emptyState'; tab: QueueTab }

type QueueRowData =
  | { id: string; type: 'currentInfo'; item: QueueItem }
  | { id: string; type: 'modesHeader' }
  | { id: string; type: 'historyTrack'; item: QueueItem; index: number }
  | { id: string; type: 'upcomingTrack'; item: QueueItem; index: number }
  | { id: string; type: 'emptyState'; tab: QueueTab }

export function PlayerQueue({
  bottomSpace,
  listAnim,
  stageTopOffset: propStageTopOffset,
  stageHeight: propStageHeight,
  onTopStateChange,
  onActionOpenChange,
}: {
  bottomSpace: number
  listAnim?: SharedValue<number>
  stageTopOffset?: number
  stageHeight?: SharedValue<number>
  onTopStateChange?: (atTop: boolean) => void
  onActionOpenChange?: (open: boolean) => void
}) {
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
  const [tab, setTab] = useState<QueueTab>('upcoming')
  const { playing: isGloballyPlaying } = useIsPlaying()

  const setQueueActionOpen = useCallback((open: boolean) => {
    onActionOpenChange?.(open)
  }, [onActionOpenChange])

  const upcomingData = useMemo<UpcomingRowData[]>(() => {
    const tab: QueueTab = 'upcoming'
    const tracks = queue.slice(1)
    if (tracks.length === 0) {
      return [{ id: `${tab}_empty`, type: 'emptyState', tab }]
    }
    return tracks.map((item, itemIndex) => ({
      id: `${tab}_${item.qid}_${itemIndex}`,
      type: 'upcomingTrack',
      item,
      index: itemIndex + 1,
    }))
  }, [queue])

  const historyData = useMemo<HistoryRowData[]>(() => {
    const tab: QueueTab = 'history'
    if (history.length === 0) {
      return [{ id: `${tab}_empty`, type: 'emptyState', tab }]
    }
    return history.map((item, itemIndex) => ({
      id: `${tab}_${item.qid}_${itemIndex}`,
      type: 'historyTrack',
      item,
      index: itemIndex,
    }))
  }, [history])

  const currentItem = queue[index]
  const modesContentOffset = currentItem ? 88 : 0
  const headerHeight = currentItem ? 194 : 106
  const scrollY = useSharedValue(0)
  const isAtTopRef = useSharedValue(true)

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
      const isTop = event.contentOffset.y <= 2
      if (isTop !== isAtTopRef.value) {
        isAtTopRef.value = isTop
        if (onTopStateChange) {
          runOnJS(onTopStateChange)(isTop)
        }
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

  // 空状态高度：舞台净高 - ModesHeader 高度 (106)
  const minContentHeight = useMemo(() => {
    return Math.max(160, queueViewportHeight - 106)
  }, [queueViewportHeight])

  // 列表最小高度：刚好允许向上滑 88pt 将正在播放推走、循环工具栏吸顶
  const minListHeight = useMemo(() => {
    return queueViewportHeight + modesContentOffset
  }, [modesContentOffset, queueViewportHeight])

  const getUpcomingItemLayout = useCallback((_: any, itemIndex: number) => {
    const isSingleEmpty = upcomingData[0]?.type === 'emptyState'
    const length = isSingleEmpty ? minContentHeight : 56
    const offset = headerHeight + itemIndex * 56
    return { length, offset, index: itemIndex }
  }, [headerHeight, minContentHeight, upcomingData])

  const getHistoryItemLayout = useCallback((_: any, itemIndex: number) => {
    const isSingleEmpty = historyData[0]?.type === 'emptyState'
    const length = isSingleEmpty ? minContentHeight : 56
    const offset = headerHeight + itemIndex * 56
    return { length, offset, index: itemIndex }
  }, [headerHeight, minContentHeight, historyData])

  const upcomingListRef = useRef<FlatList<UpcomingRowData>>(null)
  const historyListRef = useRef<FlatList<HistoryRowData>>(null)

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
    runOnJS(setDragging)(true)
    runOnJS(closeOpenQueueAction)()
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy)
  }, [])

  const onDragEnd = useCallback(() => {
    'worklet'
    runOnJS(setDragging)(false)
  }, [])

  useEffect(() => () => {
    closeOpenQueueAction()
    onActionOpenChange?.(false)
  }, [onActionOpenChange])

  const consumeOpenAction = useCallback(() => {
    const consumed = closeOpenQueueAction()
    if (consumed) setQueueActionOpen(false)
    return consumed
  }, [setQueueActionOpen])

  const pagerX = useSharedValue(0)

  const onTabChange = useCallback((nextTab: QueueTab) => {
    if (consumeOpenAction() || nextTab === tab) return
    setTab(nextTab)

    const targetScrollY = Math.min(88, Math.max(0, scrollY.value))
    if (nextTab === 'history') {
      historyListRef.current?.scrollToOffset({ offset: targetScrollY, animated: false })
    } else {
      upcomingListRef.current?.scrollToOffset({ offset: targetScrollY, animated: false })
    }
    scrollY.value = targetScrollY

    pagerX.value = withTiming(nextTab === 'history' ? -screenWidth : 0, {
      duration: 320,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    })
  }, [consumeOpenAction, pagerX, screenWidth, scrollY, tab])

  const confirmClearHistory = useCallback(() => {
    if (consumeOpenAction()) return
    Alert.alert('清除历史记录？', '该操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: () => void clearHistory() },
    ])
  }, [consumeOpenAction])

  const renderUpcomingItem = useCallback(({ item }: { item: UpcomingRowData; index: number }) => {
    if (item.type === 'emptyState') {
      return (
        <QueueEmptyState
          title="队列已播完"
          description="可在资料库中点播歌曲，或开启上方无限播放"
          action={!autoplay && provider ? { label: '开启无限播放', onPress: onToggleAutoplay } : undefined}
          minHeight={minContentHeight}
          scrollY={scrollY}
        />
      )
    }

    return (
      <QueueRow 
        item={item.item} 
        queueIndex={item.index} 
        playing={false} 
        isGloballyPlaying={!!isGloballyPlaying}
        isHistory={false}
        onSelect={() => void skipToIndex(item.index)}
        swipeEnabled={!dragging}
        onActionOpenChange={setQueueActionOpen}
      />
    )
  }, [autoplay, dragging, isGloballyPlaying, minContentHeight, onToggleAutoplay, provider, scrollY, setQueueActionOpen])

  const renderHistoryItem = useCallback(({ item }: { item: HistoryRowData; index: number }) => {
    if (item.type === 'emptyState') {
      return (
        <QueueEmptyState
          title="暂无播放历史"
          description="在此播放过的歌曲将显示在这里"
          minHeight={minContentHeight}
          scrollY={scrollY}
        />
      )
    }

    return (
      <HistoryRow 
        item={item.item} 
        onSelect={() => void playHistoryItem(item.item)}
      />
    )
  }, [minContentHeight, scrollY])

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const maxShift = currentItem ? 88 : 0
    const translateY = scrollY.value < 0 ? -scrollY.value : -Math.min(maxShift, scrollY.value)
    return {
      transform: [{ translateY }],
    }
  })

  const pagerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pagerX.value }],
  }))

  const hasUpcomingTracks = queue.length > 1

  return (
    <View
      style={[styles.container, { paddingBottom: bottomSpace }]}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <Animated.View style={[styles.headerOverlay, headerAnimatedStyle]} pointerEvents="box-none">
        {currentItem ? (
          <CurrentTrackCard
            item={currentItem}
            listAnim={listAnim}
            consumeOpenAction={consumeOpenAction}
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
          tab={tab}
          historyCount={history.length}
          provider={provider}
          onTabChange={onTabChange}
          consumeOpenAction={consumeOpenAction}
          onClearHistory={confirmClearHistory}
          onToggleAutoplay={onToggleAutoplay}
        />
      </Animated.View>

      <View style={styles.pagerViewport}>
        <Animated.View style={[styles.pagerTrack, { width: screenWidth * 2 }, pagerAnimatedStyle]}>
          <View style={[styles.page, { width: screenWidth }]}>
            <ReorderableList
              ref={upcomingListRef as any}
              data={upcomingData}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={<View style={{ height: headerHeight }} />}
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
              bounces
              decelerationRate="normal"
              showsVerticalScrollIndicator={false}
            />
          </View>

          <View style={[styles.page, { width: screenWidth }]}>
            <Animated.FlatList
              ref={historyListRef as any}
              data={historyData}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={<View style={{ height: headerHeight }} />}
              contentContainerStyle={[styles.list, { minHeight: minListHeight }]}
              getItemLayout={getHistoryItemLayout}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={5}
              onScroll={scrollHandler}
              onScrollBeginDrag={() => {
                if (closeOpenQueueAction()) setQueueActionOpen(false)
              }}
              renderItem={renderHistoryItem}
              bounces
              decelerationRate="normal"
              showsVerticalScrollIndicator={false}
            />
          </View>
        </Animated.View>
      </View>
    </View>
  )
}

function CurrentTrackCard({
  item,
  consumeOpenAction,
}: {
  item: QueueItem
  listAnim?: SharedValue<number>
  consumeOpenAction: () => boolean
}) {
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
          filled={item.isFavorite}
          onPress={() => {
            if (consumeOpenAction()) return
            void toggleFavorite(item.trackId, !item.isFavorite)
          }}
          accessibilityLabel={item.isFavorite ? '取消喜欢' : '喜欢'}
        />
        <DeckMoreButton current={item} onBeforeOpen={consumeOpenAction} />
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
  tab,
  historyCount,
  provider,
  onTabChange,
  consumeOpenAction,
  onClearHistory,
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
  tab: QueueTab
  historyCount: number
  provider: any
  onTabChange: (tab: QueueTab) => void
  consumeOpenAction: () => boolean
  onClearHistory: () => void
  onToggleAutoplay: () => void
}) {
  const tabLayouts = useRef<{ upcoming?: LayoutRectangle; history?: LayoutRectangle }>({})
  const indicatorX = useSharedValue(24)
  const indicatorOpacity = useSharedValue(1)

  const updateIndicator = useCallback((activeTab: QueueTab, animate = true) => {
    const layout = tabLayouts.current[activeTab]
    if (!layout) return
    const targetX = layout.x + (layout.width - 16) / 2
    if (animate) {
      indicatorX.value = withTiming(targetX, {
        duration: 360,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    } else {
      indicatorX.value = targetX
    }
    indicatorOpacity.value = 1
  }, [indicatorOpacity, indicatorX])

  useEffect(() => {
    updateIndicator(tab, true)
  }, [tab, updateIndicator])

  const onTabLayout = (t: QueueTab, layout: LayoutRectangle) => {
    tabLayouts.current[t] = layout
    if (t === tab) {
      updateIndicator(t, false)
    }
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    opacity: indicatorOpacity.value,
  }))

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
      <View style={styles.queueTabsContainer}>
        <View style={styles.queueTabs} accessibilityRole="tablist">
          <QueueTabButton
            label="继续播放"
            selected={tab === 'upcoming'}
            onPress={() => onTabChange('upcoming')}
            onLayout={(e) => onTabLayout('upcoming', e.nativeEvent.layout)}
          />
          <QueueTabButton
            label="历史记录"
            selected={tab === 'history'}
            onPress={() => onTabChange('history')}
            onLayout={(e) => onTabLayout('history', e.nativeEvent.layout)}
          />
          <View style={styles.queueTabSpacer} />
          {tab === 'history' && historyCount > 0 ? (
            <Pressable
              onPress={onClearHistory}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="清除播放历史"
            >
              <Text style={styles.historyClear}>清除</Text>
            </Pressable>
          ) : null}
        </View>
        <Animated.View style={[styles.queueTabIndicator, indicatorStyle]} />
      </View>
    </View>
  )
}

function QueueTabButton({
  label,
  selected,
  onPress,
  onLayout,
}: {
  label: string
  selected: boolean
  onPress: () => void
  onLayout?: (e: LayoutChangeEvent) => void
}) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={styles.queueTab}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.queueTabText, selected && styles.queueTabTextActive]}>{label}</Text>
    </Pressable>
  )
}

function ModeButton({ icon, label, active, onPress }: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
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

function QueueRow({
  item,
  queueIndex,
  playing,
  isGloballyPlaying,
  isHistory,
  onSelect,
  swipeEnabled,
  onActionOpenChange,
}: {
  item: QueueItem
  queueIndex: number
  playing: boolean
  isGloballyPlaying: boolean
  isHistory: boolean
  onSelect: () => void
  swipeEnabled: boolean
  onActionOpenChange?: (open: boolean) => void
}) {
  const isActive = useIsActive()
  const drag = useReorderableDrag()
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
      backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
      borderRadius: isActive ? radius.md : 0,
    }
  })
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
          onPress={() => void removeFromQueue(queueIndex)}
          accessibilityRole="button"
          accessibilityLabel={`从队列移除 ${item.title}`}
        >
          <View style={styles.deleteIconBg}>
            <Icon name="remove" size={20} color={colors.danger || 'red'} />
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
        if (closeOpenQueueAction()) return
        onSelect()
      }}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`播放 ${item.title}，${item.artistText}`}
    >
      <CoverImage resource={item.artwork} size={48} borderRadius={radius.sm} />
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle]} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>{item.artistText}</Text>
      </View>
      
      {!isHistory && (
        <View style={styles.rowRight}>
          {playing ? (
            <IconButton
              name={isGloballyPlaying ? 'pause' : 'play'}
              size={iconSize.md}
              color={colors.bgPrimary}
              style={styles.playingIconBg}
              onPress={() => void togglePlay()}
              accessibilityLabel={isGloballyPlaying ? '暂停' : '播放'}
            />
          ) : null}
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
            hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
            style={styles.dragSlot}
            accessibilityRole="button"
            accessibilityLabel="拖动排序"
          >
            <Icon name="drag" size={20} color={colors.iconDim} />
          </Pressable>
        </View>
      )}
    </Pressable>
    </Animated.View>
  )

  if (isHistory) {
    return content
  }

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

function HistoryRow({
  item,
  onSelect,
}: {
  item: QueueItem
  onSelect: () => void
}) {
  const startX = useRef(0)
  const startY = useRef(0)
  const moved = useRef(false)

  return (
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
        if (closeOpenQueueAction()) return
        onSelect()
      }}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`播放 ${item.title}，${item.artistText}`}
    >
      <CoverImage resource={item.artwork} size={48} borderRadius={radius.sm} />
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle]} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>{item.artistText}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
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
    overflow: 'hidden',
  },
  pagerTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    flex: 1,
    height: '100%',
  },
  list: { paddingBottom: spacing.xxl },
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
  
  queueTabsContainer: {
    position: 'relative',
    minHeight: 34,
    justifyContent: 'flex-start',
  },
  queueTabs: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  queueTab: { minHeight: 30, justifyContent: 'flex-start' },
  queueTabText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    letterSpacing: -0.2,
  },
  queueTabTextActive: {
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  queueTabIndicator: {
    position: 'absolute',
    top: 26,
    left: 0,
    width: 16,
    height: 2.5,
    borderRadius: radius.pill,
    backgroundColor: colors.textPrimary,
  },
  queueTabSpacer: { flex: 1 },
  historyClear: { ...typography.callout, color: colors.iconMid },
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
  rowMain: { flex: 1, gap: 2, justifyContent: 'center' },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowTitle: { ...typography.callout, color: colors.textPrimary, flexShrink: 1 },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  
  deleteAction: { backgroundColor: colors.danger || 'red', justifyContent: 'center', alignItems: 'center', width: 80, height: '100%' },
  deleteIconBg: { backgroundColor: 'white', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  dragSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playingIconBg: { backgroundColor: colors.textPrimary, borderRadius: radius.pill, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
})
