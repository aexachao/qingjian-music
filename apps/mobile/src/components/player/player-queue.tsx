import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, Animated as RNAnimated, type FlatList } from 'react-native'
import { BlurView } from 'expo-blur'
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
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import type { QueueItem, PlayMode, PlaySource } from '@qj/core-domain'
import { Icon, IconButton, iconSize, type IconName } from '@/components/icon'
import { LivePlayingBars } from '@/components/playing-bars'
import { useServerSession } from '@/lib/server-session'
import {
  clearHistory,
  cycleRepeat,
  extendWithRadio,
  fillRadio,
  moveInQueue,
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

const USE_BLUR = Platform.OS === 'ios'

const LONG_PRESS_MS = 250
const TAP_SLOP = 12
const RADIO_FETCH_MORE = 10

// 互斥的左滑删除引用
let openSwipeableRef: Swipeable | null = null

const closeOpenSwipeable = () => {
  if (openSwipeableRef) {
    openSwipeableRef.close()
    openSwipeableRef = null
  }
}

type QueueRowData =
  | { id: string; type: 'historyHeader' }
  | { id: string; type: 'historyTrack'; item: QueueItem; index: number }
  | { id: string; type: 'currentInfo'; item: QueueItem }
  | { id: string; type: 'modesHeader' }
  | { id: string; type: 'upcomingTrack'; item: QueueItem; index: number }

export function PlayerQueue({
  bottomSpace,
  listAnim,
  onTopStateChange,
}: {
  bottomSpace: number
  listAnim?: SharedValue<number>
  onTopStateChange?: (atTop: boolean) => void
}) {
  const insets = useSafeAreaInsets()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const stickyTopOffset = insets.top + spacing.sm + 32 + spacing.xs

  const { provider, connection } = useServerSession()
  const queue = usePlayerStore((state) => state.queue)
  const index = usePlayerStore((state) => state.index)
  const playMode = usePlayerStore((state) => state.playMode)
  const autoplay = usePlayerStore((state) => state.autoplay)
  const source = usePlayerStore((state) => state.source)
  const { playing: isGloballyPlaying } = useIsPlaying()

  const queueData = useMemo(() => {
    const data: QueueRowData[] = []
    
    const history = queue.slice(0, index)
    if (history.length > 0) {
      data.push({ id: 'historyHeader', type: 'historyHeader' })
      history.forEach((item, i) => {
        data.push({ id: `hist_${item.qid}`, type: 'historyTrack', item, index: i })
      })
    }

    const currentItem = queue[index]
    if (currentItem) {
      data.push({ id: 'currentInfo', type: 'currentInfo', item: currentItem })
    }

    const modesIndex = data.length
    data.push({ id: 'modesHeader', type: 'modesHeader' })

    const upcoming = queue.slice(index + 1)
    upcoming.forEach((item, i) => {
      data.push({ id: `upcoming_${item.qid}`, type: 'upcomingTrack', item, index: index + 1 + i })
    })

    const historyOffset = history.length > 0 ? 52 + history.length * 56 : 0;
    return { data, modesIndex, currentInfoIndex: history.length > 0 ? history.length + 1 : 0, historyOffset }
  }, [queue, index])

  const modesContentOffset = queueData.historyOffset + 88
  const scrollY = useSharedValue(queueData.historyOffset)
  const dragStartScrollY = useSharedValue(0)
  const isAtTopRef = useSharedValue(queueData.historyOffset === 0)
  const [atTop, setAtTop] = useState(queueData.historyOffset === 0)

  const snapToHistoryOffset = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: queueData.historyOffset, animated: true })
  }, [queueData.historyOffset])

  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: (event) => {
      dragStartScrollY.value = event.contentOffset.y
    },
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
      const isTop = event.contentOffset.y <= 2
      if (isTop !== isAtTopRef.value) {
        isAtTopRef.value = isTop
        if (onTopStateChange) {
          runOnJS(onTopStateChange)(isTop)
        }
        runOnJS(setAtTop)(isTop)
      }
    },
    onEndDrag: (event) => {
      // 若滑动起始于继续播放/模式栏区域（正在播放下方），向下滑动时强制拦截在正在播放吸顶处（historyOffset），绝不单次滑入历史记录
      if (
        dragStartScrollY.value >= queueData.historyOffset + 10 &&
        event.contentOffset.y < queueData.historyOffset
      ) {
        runOnJS(snapToHistoryOffset)()
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
    if (state.queue.length - state.index - 1 > RADIO_UPCOMING_KEEP) return
    void extendWithRadio(provider, connection.id).catch(() => {})
  }, [autoplay, connection, provider])

  const getItemLayout = useCallback((_: any, index: number) => {
    let offset = 0;
    const items = queueData.data;
    for (let i = 0; i < index; i++) {
      const t = items[i]?.type;
      offset += t === 'historyHeader' ? 52 : t === 'modesHeader' ? 106 : t === 'currentInfo' ? 88 : 56;
    }
    const currType = items[index]?.type;
    const length = currType === 'historyHeader' ? 52 : currType === 'modesHeader' ? 106 : currType === 'currentInfo' ? 88 : 56;
    return { length, offset, index };
  }, [queueData.data])

  const listRef = useRef<FlatList<any>>(null)

  const lockToCurrent = useCallback(() => {
    if (queueData.historyOffset > 0 && listRef.current) {
      listRef.current.scrollToOffset({ offset: queueData.historyOffset, animated: false })
      scrollY.value = queueData.historyOffset
    }
  }, [queueData.historyOffset, scrollY])

  useEffect(() => {
    lockToCurrent()
    const t1 = setTimeout(lockToCurrent, 16)
    const t2 = setTimeout(lockToCurrent, 60)
    const t3 = setTimeout(lockToCurrent, 150)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [lockToCurrent])

  const fillingRef = useRef(false)
  const onEndReached = useCallback(() => {
    if (!provider || !connection) return
    const { source: src, index: current, queue: list } = usePlayerStore.getState()
    const upcoming = list.length - current - 1
    if (src?.kind === 'radio') {
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
    const fromItem = queueData.data[from]
    if (fromItem?.type !== 'upcomingTrack') return
    
    const firstUpcomingIndex = queueData.data.findIndex(d => d.type === 'upcomingTrack')
    if (firstUpcomingIndex === -1) return
    
    const clampedTo = Math.max(firstUpcomingIndex, to)
    const actualFrom = fromItem.index
    const actualTo = index + 1 + (clampedTo - firstUpcomingIndex)
    
    void moveInQueue(actualFrom, actualTo)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [queueData.data, index])

  const onDragStart = useCallback(() => {
    'worklet'
    runOnJS(closeOpenSwipeable)()
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy)
  }, [])

  const renderItem = useCallback(({ item, index: rowIndex }: { item: QueueRowData; index: number }) => {
    if (item.type === 'historyHeader') {
      return (
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>历史记录</Text>
          <Pressable onPress={() => void clearHistory()} hitSlop={8}>
            <Text style={styles.historyClear}>清除</Text>
          </Pressable>
        </View>
      )
    }

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
          source={source}
          provider={provider}
          onToggleAutoplay={onToggleAutoplay}
        />
      )
    }

    if (item.type === 'currentInfo') {
      return (
        <CurrentTrackCard
          item={item.item}
          listAnim={listAnim}
          stickyTopOffset={stickyTopOffset}
          historyOffset={queueData.historyOffset}
          scrollY={scrollY}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
        />
      )
    }

    const playing = item.type === 'upcomingTrack' ? false : (item.index === index)
    const isHistory = item.type === 'historyTrack'

    return (
      <QueueRow 
        item={item.item} 
        queueIndex={item.index} 
        playing={playing} 
        isGloballyPlaying={!!isGloballyPlaying}
        isHistory={isHistory}
      />
    )
  }, [
    queue,
    index,
    stickyTopOffset,
    modesContentOffset,
    queueData.historyOffset,
    scrollY,
    screenWidth,
    screenHeight,
    playMode,
    autoplay,
    source,
    provider,
    onToggleAutoplay,
    isGloballyPlaying,
    listAnim,
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
        getItemLayout={getItemLayout}
        initialScrollIndex={queueData.currentInfoIndex}
        initialNumToRender={queueData.data.length}
        contentOffset={{ x: 0, y: queueData.historyOffset }}
        onLayout={lockToCurrent}
        onScroll={scrollHandler}
        shouldUpdateActiveItem={true}
        onDragStart={onDragStart}
        onIndexChange={onIndexChange}
        cellAnimations={{ transform: [] }}
        renderItem={renderItem}
        stickyHeaderIndices={
          queueData.data[queueData.currentInfoIndex]?.type === 'currentInfo'
            ? [queueData.currentInfoIndex, queueData.modesIndex]
            : [queueData.modesIndex]
        }
        bounces={!atTop}
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
  stickyTopOffset,
  historyOffset,
  scrollY,
  screenWidth,
  screenHeight,
}: {
  item: QueueItem
  listAnim?: SharedValue<number>
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
          onPress={() => void toggleFavorite(item.trackId, !item.isFavorite)}
          accessibilityLabel={item.isFavorite ? '取消喜欢' : '喜欢'}
        />
        <DeckMoreButton current={item} />
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
  source,
  provider,
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
  source?: PlaySource
  provider: any
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
          onPress={() => void setShuffledOrder(!playMode.shuffle)}
        />
        <ModeButton
          icon={playMode.repeat === 'one' ? 'repeatOne' : 'repeat'}
          label={playMode.repeat === 'one' ? '单曲循环' : '列表循环'}
          active={playMode.repeat !== 'off'}
          onPress={() => void cycleRepeat()}
        />
        {provider?.capabilities.radio ? (
          <ModeButton icon="infinity" label="无限播放" active={autoplay} onPress={onToggleAutoplay} />
        ) : null}
      </View>
      <View style={styles.continuePlaying}>
        <Text style={styles.continueTitle}>继续播放</Text>
        {source ? <Text style={styles.continueSubtitle}>来自 {source.label}</Text> : null}
      </View>
    </View>
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

function QueueRow({ item, queueIndex, playing, isGloballyPlaying, isHistory }: { item: QueueItem; queueIndex: number; playing: boolean; isGloballyPlaying: boolean; isHistory: boolean }) {
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
  const swipeableRef = useRef<Swipeable>(null)

  const renderRightActions = (progress: any, dragX: any) => {
    const trans = dragX.interpolate({ inputRange: [-80, 0], outputRange: [0, 80], extrapolate: 'clamp' });
    return (
      <RNAnimated.View style={{ transform: [{ translateX: trans }] }}>
        <Pressable style={styles.deleteAction} onPress={() => void removeFromQueue(queueIndex)}>
          <View style={styles.deleteIconBg}>
            <Icon name="remove" size={20} color={colors.danger || 'red'} />
          </View>
        </Pressable>
      </RNAnimated.View>
    )
  }

  const onSwipeableWillOpen = () => {
    if (openSwipeableRef && openSwipeableRef !== swipeableRef.current) {
      closeOpenSwipeable()
    }
    openSwipeableRef = swipeableRef.current
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
        if (!moved.current) void skipToIndex(queueIndex)
      }}
      style={styles.row}
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
            onPressIn={drag}
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
      renderRightActions={renderRightActions} 
      overshootRight={false}
      friction={2}
      overshootFriction={8} 
      containerStyle={{ overflow: 'visible' }}
      onSwipeableWillOpen={onSwipeableWillOpen}
    >
      {content}
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingBottom: spacing.xxl },
  empty: { ...typography.callout, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  
  historyHeader: {
    height: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingBottom: 8,
  },
  historyTitle: { ...typography.title, lineHeight: 28, color: colors.textPrimary },
  historyClear: { ...typography.callout, color: colors.iconMid, paddingBottom: 2 },

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
  
  continuePlaying: {
    gap: 4,
    marginBottom: spacing.xs,
  },
  continueTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  continueSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    letterSpacing: -0.1,
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
