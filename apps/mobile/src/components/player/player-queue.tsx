import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions, Animated as RNAnimated, type FlatList } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import ReorderableList, { useIsActive, useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list'
import * as Haptics from 'expo-haptics'
import Animated, {
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

type QueueRowData =
  | { id: string; type: 'currentInfo'; item: QueueItem }
  | { id: string; type: 'modesHeader' }
  | { id: string; type: 'historyTrack'; item: QueueItem; index: number }
  | { id: string; type: 'upcomingTrack'; item: QueueItem; index: number }

export function PlayerQueue({
  bottomSpace,
  listAnim,
  onTopStateChange,
  onActionOpenChange,
}: {
  bottomSpace: number
  listAnim?: SharedValue<number>
  onTopStateChange?: (atTop: boolean) => void
  onActionOpenChange?: (open: boolean) => void
}) {
  const insets = useSafeAreaInsets()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const stickyTopOffset = insets.top + spacing.sm + 32 + spacing.xs

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

  const queueData = useMemo(() => {
    const data: QueueRowData[] = []
    const currentItem = queue[index]
    if (currentItem) data.push({ id: 'currentInfo', type: 'currentInfo', item: currentItem })

    const modesIndex = data.length
    data.push({ id: 'modesHeader', type: 'modesHeader' })

    const tracks = tab === 'upcoming' ? queue.slice(1) : history
    tracks.forEach((item, itemIndex) => {
      const queueIndex = tab === 'upcoming' ? itemIndex + 1 : itemIndex
      data.push({
        id: `${tab}_${item.qid}_${itemIndex}`,
        type: tab === 'upcoming' ? 'upcomingTrack' : 'historyTrack',
        item,
        index: queueIndex,
      })
    })

    return { data, modesIndex }
  }, [history, index, queue, tab])

  const modesContentOffset = 88
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

  const getItemLayout = useCallback((_: any, itemIndex: number) => {
    let offset = 0
    const items = queueData.data
    for (let currentIndex = 0; currentIndex < itemIndex; currentIndex += 1) {
      offset += items[currentIndex]?.type === 'modesHeader' ? 106 : items[currentIndex]?.type === 'currentInfo' ? 88 : 56
    }
    const length = items[itemIndex]?.type === 'modesHeader' ? 106 : items[itemIndex]?.type === 'currentInfo' ? 88 : 56
    return { length, offset, index: itemIndex }
  }, [queueData.data])

  const listRef = useRef<FlatList<any>>(null)

  const fillingRef = useRef(false)
  const onEndReached = useCallback(() => {
    if (tab !== 'upcoming' || !provider || !connection) return
    const { source: src, queue: list } = usePlayerStore.getState()
    const upcoming = list.length - 1
    if (src?.kind === 'radio') {
      if (fillingRef.current) return
      fillingRef.current = true
      void fillRadio(provider, connection.id, upcoming + RADIO_FETCH_MORE)
        .catch(() => {})
        .finally(() => { fillingRef.current = false })
    } else if (autoplay && upcoming <= RADIO_UPCOMING_KEEP) {
      void extendWithRadio(provider, connection.id).catch(() => {})
    }
  }, [autoplay, connection, provider, tab])

  const onReorder = useCallback(({ from, to }: ReorderableListReorderEvent) => {
    const fromItem = queueData.data[from]
    if (fromItem?.type !== 'upcomingTrack') return
    
    const firstUpcomingIndex = queueData.data.findIndex(d => d.type === 'upcomingTrack')
    if (firstUpcomingIndex === -1) return
    
    const clampedTo = Math.max(firstUpcomingIndex, to)
    const actualFrom = fromItem.index
    const actualTo = 1 + (clampedTo - firstUpcomingIndex)
    
    void moveInQueue(actualFrom, actualTo)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [queueData.data])

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

  const onTabChange = useCallback((nextTab: QueueTab) => {
    if (consumeOpenAction() || nextTab === tab) return
    setTab(nextTab)
  }, [consumeOpenAction, tab])

  const confirmClearHistory = useCallback(() => {
    if (consumeOpenAction()) return
    Alert.alert('清除历史记录？', '该操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: () => void clearHistory() },
    ])
  }, [consumeOpenAction])

  const renderItem = useCallback(({ item }: { item: QueueRowData; index: number }) => {
    if (item.type === 'modesHeader') {
      return (
        <ModesHeader
          artwork={queue[index]?.artwork}
          stickyTopOffset={stickyTopOffset}
          modesContentOffset={modesContentOffset}
          scrollY={scrollY}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
          playMode={playMode}
          autoplay={autoplay}
          tab={tab}
          provider={provider}
          onTabChange={onTabChange}
          consumeOpenAction={consumeOpenAction}
          onClearHistory={confirmClearHistory}
          onToggleAutoplay={onToggleAutoplay}
        />
      )
    }

    if (item.type === 'currentInfo') {
      return (
        <CurrentTrackCard
          item={item.item}
          listAnim={listAnim}
          consumeOpenAction={consumeOpenAction}
          stickyTopOffset={stickyTopOffset}
          historyOffset={0}
          scrollY={scrollY}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
        />
      )
    }

    const playing = false
    const isHistory = item.type === 'historyTrack'

    return (
      <QueueRow 
        item={item.item} 
        queueIndex={item.index} 
        playing={playing} 
        isGloballyPlaying={!!isGloballyPlaying}
        isHistory={isHistory}
        onSelect={isHistory ? () => void playHistoryItem(item.item) : () => void skipToIndex(item.index)}
        swipeEnabled={!dragging}
        onActionOpenChange={setQueueActionOpen}
      />
    )
  }, [
    queue,
    index,
    stickyTopOffset,
    modesContentOffset,
    scrollY,
    screenWidth,
    screenHeight,
    playMode,
    autoplay,
    tab,
    provider,
    onTabChange,
    confirmClearHistory,
    onToggleAutoplay,
    isGloballyPlaying,
    listAnim,
    dragging,
    consumeOpenAction,
    setQueueActionOpen,
  ])

  return (
    <View style={[styles.container, { paddingBottom: bottomSpace }]}>
      <ReorderableList
        ref={listRef}
        data={queueData.data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onReorder={onReorder}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        panActivateAfterLongPress={LONG_PRESS_MS}
        dragEnabled={tab === 'upcoming'}
        getItemLayout={getItemLayout}
        initialNumToRender={queueData.data.length}
        onScroll={scrollHandler}
        onScrollBeginDrag={() => {
          if (closeOpenQueueAction()) setQueueActionOpen(false)
        }}
        shouldUpdateActiveItem={true}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onIndexChange={onIndexChange}
        cellAnimations={{ transform: [] }}
        renderItem={renderItem}
        stickyHeaderIndices={[queueData.modesIndex]}
        bounces
        decelerationRate="normal"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.empty}>队列是空的</Text>}
      />
    </View>
  )
}

function CurrentTrackCard({
  item,
  listAnim,
  consumeOpenAction,
  stickyTopOffset,
  historyOffset,
  scrollY,
  screenWidth,
  screenHeight,
}: {
  item: QueueItem
  listAnim?: SharedValue<number>
  consumeOpenAction: () => boolean
  stickyTopOffset?: number
  historyOffset?: number
  scrollY?: SharedValue<number>
  screenWidth?: number
  screenHeight?: number
}) {
  const toggleFavorite = useToggleFavorite()

  const bgStyle = useAnimatedStyle(() => {
    if (stickyTopOffset === undefined || historyOffset === undefined || !scrollY) return {}
    const currentScreenY = stickyTopOffset + Math.max(0, historyOffset - scrollY.value)
    return {
      transform: [{ translateY: -currentScreenY }],
    }
  })

  const thumbnailAnimatedStyle = useAnimatedStyle(() => {
    if (!listAnim) return {}
    // 只有在转场即将结束（>= 0.95）时，原生卡片自身的封面才平滑淡入，其余时间保持透明，避免双封面重叠
    return {
      opacity: interpolate(listAnim.value, [0.95, 1], [0, 1], Extrapolation.CLAMP),
    }
  })

  const infoAnimatedStyle = useAnimatedStyle(() => {
    if (!listAnim) return {}
    // 动画前半段大封面还在空中缩放移动，保持文字隐藏，待封面接近归位（0.55+）时才向左滑入，彻底避免大封面压在文字上
    return {
      opacity: interpolate(listAnim.value, [0.55, 0.9], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(listAnim.value, [0.55, 0.9], [16, 0], Extrapolation.CLAMP) },
      ],
    }
  })

  return (
    <View style={styles.currentCard}>
      {screenWidth && screenHeight ? (
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
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
            <CoverBackdrop artwork={item.artwork} />
          </Animated.View>
        </View>
      ) : null}
      <Animated.View style={thumbnailAnimatedStyle}>
        <CoverImage resource={item.artwork} size={64} borderRadius={radius.md} />
      </Animated.View>
      <Animated.View style={[styles.currentInfo, infoAnimatedStyle]}>
        <Text style={styles.currentTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.currentArtist} numberOfLines={1}>{item.artistText}</Text>
      </Animated.View>
      <Animated.View style={[styles.currentActions, infoAnimatedStyle]}>
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
      </Animated.View>
    </View>
  )
}

function ModesHeader({
  artwork,
  stickyTopOffset,
  modesContentOffset,
  scrollY,
  screenWidth,
  screenHeight,
  playMode,
  autoplay,
  tab,
  provider,
  onTabChange,
  consumeOpenAction,
  onClearHistory,
  onToggleAutoplay,
}: {
  artwork?: any
  stickyTopOffset: number
  modesContentOffset: number
  scrollY: SharedValue<number>
  screenWidth: number
  screenHeight: number
  playMode: PlayMode
  autoplay: boolean
  tab: QueueTab
  provider: any
  onTabChange: (tab: QueueTab) => void
  consumeOpenAction: () => boolean
  onClearHistory: () => void
  onToggleAutoplay: () => void
}) {
  const bgStyle = useAnimatedStyle(() => {
    const currentScreenY = stickyTopOffset + Math.max(0, modesContentOffset - scrollY.value)
    return {
      transform: [{ translateY: -currentScreenY }],
    }
  })

  return (
    <View style={styles.modesHeader}>
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
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
      </View>
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
          label={playMode.repeat === 'one' ? '单曲循环' : '列表循环'}
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
      <View style={styles.queueTabs} accessibilityRole="tablist">
        <QueueTabButton label="继续播放" selected={tab === 'upcoming'} onPress={() => onTabChange('upcoming')} />
        <QueueTabButton label="历史记录" selected={tab === 'history'} onPress={() => onTabChange('history')} />
        <View style={styles.queueTabSpacer} />
        {tab === 'history' ? (
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
    </View>
  )
}

function QueueTabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.queueTab}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.queueTabText, selected && styles.queueTabTextActive]}>{label}</Text>
      <View style={[styles.queueTabIndicator, selected && styles.queueTabIndicatorActive]} />
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

function QueueRow({ item, queueIndex, playing, isGloballyPlaying, isHistory, onSelect, swipeEnabled, onActionOpenChange }: { item: QueueItem; queueIndex: number; playing: boolean; isGloballyPlaying: boolean; isHistory: boolean; onSelect: () => void; swipeEnabled: boolean; onActionOpenChange?: (open: boolean) => void }) {
  const isActive = useIsActive()
  const drag = useReorderableDrag()
  const elevation = useSharedValue(0)

  useEffect(() => {
    elevation.value = withTiming(isActive ? 8 : 0)
  }, [isActive, elevation])

  const animatedStyle = useAnimatedStyle(() => ({
    elevation: elevation.value,
    shadowOpacity: elevation.value / 20,
    shadowRadius: elevation.value * 2,
    shadowOffset: { width: 0, height: elevation.value },
    zIndex: isActive ? 100 : 0,
    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
    borderRadius: isActive ? radius.md : 0,
  }))
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

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  
  queueTabs: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  queueTab: { minHeight: 34, justifyContent: 'flex-start' },
  queueTabText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    letterSpacing: -0.2,
  },
  queueTabTextActive: { color: colors.textPrimary },
  queueTabIndicator: {
    width: '50%',
    alignSelf: 'center',
    height: 2,
    marginTop: 6,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  queueTabIndicatorActive: { backgroundColor: colors.textPrimary },
  queueTabSpacer: { flex: 1 },
  historyClear: { ...typography.callout, color: colors.iconMid },

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
