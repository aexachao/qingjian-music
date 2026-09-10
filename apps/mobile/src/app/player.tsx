import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'

import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { LinearGradient } from 'expo-linear-gradient'
import { AirplayRouteButton } from '../../modules/airplay-button'
import { AuthGate } from '@/lib/auth-gate'
import { CoverImage } from '@/components/cover-image'
import { CoverBackdrop } from '@/components/player/cover-backdrop'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { LyricView } from '@/components/lyric-view'
import { PlayerDeck } from '@/components/player/player-deck'
import { closeOpenQueueAction, CurrentTrackCard, PlayerQueue } from '@/components/player/player-queue'
import { useLyricSheet } from '@/lib/lyric-offset'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

const LYRIC_TICK_MS = 200
const CHROME_HIDE_IDLE_MS = 3000

type PlayerMode = 'cover' | 'lyrics' | 'list'

export default function PlayerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  
  const current = usePlayerStore(selectCurrent)
  const lyricQuery = useLyricSheet(current?.trackId ?? '')
  const hasLyrics = Boolean(lyricQuery.data && lyricQuery.data.lines.length > 0)
  const { playing } = useIsPlaying()

  const [mode, setMode] = useState<PlayerMode>('cover')
  const [chromeVisible, setChromeVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const stageHeight = useSharedValue(380)
  const stageTopOffset = insets.top + spacing.sm + 50 + spacing.xs

  // 动画状态
  const chromeAnim = useSharedValue(1) // 1: 显示，0: 隐藏
  const listAnim = useSharedValue(0)

  useEffect(() => {
    if (mode === 'list') {
      listAnim.value = withTiming(1, {
        duration: 320,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      })
    } else {
      listAnim.value = withTiming(0, {
        duration: 320,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      })
    }
  }, [mode, listAnim])

  // 交互防抖计时器与显隐状态引用
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chromeVisibleRef = useRef(true)

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const revealChrome = useCallback(() => {
    clearHideTimer()
    if (!chromeVisibleRef.current) {
      chromeVisibleRef.current = true
      setChromeVisible(true)
      chromeAnim.value = withTiming(1, { duration: 250 })
    }
  }, [chromeAnim, clearHideTimer])

  const hideChrome = useCallback(() => {
    clearHideTimer()
    if (chromeVisibleRef.current) {
      chromeVisibleRef.current = false
      setChromeVisible(false)
      chromeAnim.value = withTiming(0, { duration: 300 })
    }
  }, [chromeAnim, clearHideTimer])

  const noteLyricActivity = useCallback(() => {
    revealChrome()
    // 只有在歌词模式下、正在播放、且存在歌词时，才启动 3 秒隐藏倒计时
    if (mode === 'lyrics' && playing && hasLyrics) {
      hideTimer.current = setTimeout(() => {
        hideChrome()
      }, CHROME_HIDE_IDLE_MS)
    }
  }, [mode, playing, hasLyrics, revealChrome, hideChrome])

  // 每次切换模式、播放状态改变时，检查是否需要启动或取消隐藏计时器
  useEffect(() => {
    if (mode === 'lyrics' && playing && hasLyrics) {
      noteLyricActivity()
    } else {
      // 退出歌词模式、暂停播放、或暂无歌词时，始终显示周边，并清除计时器
      revealChrome()
    }
    return clearHideTimer
  }, [mode, playing, hasLyrics, noteLyricActivity, revealChrome, clearHideTimer])

  const dismiss = useCallback(() => router.back(), [router])

  const translateY = useSharedValue(height || 850)
  const startY = useSharedValue(0)
  const [isListAtTop, setIsListAtTop] = useState(true)
  const [isLyricAtTop, setIsLyricAtTop] = useState(true)
  const [queueActionOpen, setQueueActionOpen] = useState(false)

  useEffect(() => {
    if (mode === 'list') {
      setIsListAtTop(true)
    } else if (mode === 'lyrics') {
      setIsLyricAtTop(true)
    }
  }, [mode])

  useEffect(() => {
    translateY.value = withTiming(0, {
      duration: 480,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    })
  }, [translateY])

  const createDismissPan = useCallback((enabled: boolean) =>
    Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY(8)
      .failOffsetY(-15)
      .onTouchesDown((event) => {
        console.log(`[DISMISS-PAN] onTouchesDown: enabled=${enabled}, isListAtTop=${isListAtTop}, mode=${mode}, touches=${event.allTouches.length}`)
        if (!queueActionOpen) return
        runOnJS(closeOpenQueueAction)()
        runOnJS(setQueueActionOpen)(false)
      })
      .onBegin((event) => {
        console.log(`[DISMISS-PAN] onBegin: y=${event.y}, enabled=${enabled}`)
        // 若在进场动画期间触摸，立即中止当前动画并锚定当前位置
        translateY.value = translateY.value
      })
      .onStart((event) => {
        console.log(`[DISMISS-PAN] onStart ACTIVE: y=${event.y}, transY=${event.translationY}`)
        startY.value = translateY.value
      })
      .onUpdate((event) => {
        console.log(`[DISMISS-PAN] onUpdate: transY=${event.translationY.toFixed(1)}`)
        const next = startY.value + event.translationY
        translateY.value = Math.max(0, next)
      })
      .onEnd((event) => {
        console.log(`[DISMISS-PAN] onEnd: transY=${event.translationY.toFixed(1)}, vy=${event.velocityY.toFixed(1)}`)
        const pageHeight = height || 850
        // 动量投射：结合当前位移与松手瞬时速度（Apple Music / iOS 原生交互物理法则）
        const projectedY = translateY.value + event.velocityY * 0.15
        const shouldDismiss =
          (projectedY > pageHeight * 0.4 && translateY.value > 60) ||
          (translateY.value > pageHeight * 0.5)

        if (shouldDismiss && event.velocityY > -200) {
          translateY.value = withTiming(pageHeight + 100, {
            duration: 450,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
          }, () => {
            runOnJS(dismiss)()
          })
        } else {
          translateY.value = withTiming(0, {
            duration: 420,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
          })
        }
      })
      .onFinalize((event, success) => {
        console.log(`[DISMISS-PAN] onFinalize: success=${success}, transY=${event.translationY.toFixed(1)}`)
      }), [height, translateY, startY, dismiss, queueActionOpen, isListAtTop, mode])

  const triggerDismiss = useCallback(() => {
    const pageHeight = height || 850
    translateY.value = withTiming(pageHeight, {
      duration: 400,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    }, () => {
      runOnJS(dismiss)()
    })
  }, [height, translateY, dismiss])

  const dismissWithAction = useCallback((action: () => void) => {
    const pageHeight = height || 850
    translateY.value = withTiming(pageHeight, {
      duration: 350,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    }, () => {
      runOnJS(dismiss)()
      runOnJS(action)()
    })
  }, [height, translateY, dismiss])

  const dismissGesture = useMemo(
    () =>
      createDismissPan(
        !menuOpen &&
          (mode !== 'list' || isListAtTop) &&
          (mode !== 'lyrics' || isLyricAtTop),
      ),
    [createDismissPan, menuOpen, mode, isListAtTop, isLyricAtTop],
  )
  const headerDismissGesture = useMemo(
    () => createDismissPan(!menuOpen),
    [createDismissPan, menuOpen]
  )

  const rootAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.bgPrimary,
    borderRadius: 32,
  }))

  const coverSize = Math.min(width - spacing.xl * 2, 420)

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chromeAnim.value,
    transform: [{ translateY: interpolate(chromeAnim.value, [0, 1], [20, 0], Extrapolation.CLAMP) }],
  }))

  const bottomChromeStyle = useAnimatedStyle(() => ({
    opacity: chromeAnim.value,
  }))

  const topHandleStyle = useAnimatedStyle(() => ({
    opacity: mode === 'lyrics' ? 1 : chromeAnim.value,
  }))

  const queueAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(listAnim.value, [0.15, 0.9], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(listAnim.value, [0.15, 1], [16, 0], Extrapolation.CLAMP) },
    ],
  }))

  const coverAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(listAnim.value, [0, 1], [1, 0.92], Extrapolation.CLAMP)
    const opacity = interpolate(listAnim.value, [0, 0.6], [1, 0], Extrapolation.CLAMP)
    return {
      opacity,
      transform: [{ scale }],
    }
  })

  if (!current) {
    return <EmptyPlayerState onDismiss={dismiss} />
  }

  return (
    <AuthGate group="protected">
      <GestureDetector gesture={dismissGesture}>
      <Animated.View style={[rootAnimatedStyle, { paddingTop: insets.top + spacing.sm }]}>
        <CoverBackdrop artwork={current.artwork} />

        <GestureDetector gesture={headerDismissGesture}>
          <Animated.View style={[styles.header, topHandleStyle]}>
            <View style={styles.dragHandle} />
          </Animated.View>
        </GestureDetector>

        {mode === 'lyrics' ? (
          <GestureDetector gesture={headerDismissGesture}>
            <View style={styles.pinnedHeader}>
              <CurrentTrackCard
                item={current}
                consumeOpenAction={() => false}
                onDismissWithAction={dismissWithAction}
                onMenuOpenChange={setMenuOpen}
              />
            </View>
          </GestureDetector>
        ) : null}

        {mode === 'lyrics' ? (
          <View style={styles.lyricsStage}>
            <LyricPage
              trackId={current.trackId}
              bottomSpace={220 + insets.bottom}
              controlsVisible={chromeVisible}
              onReveal={noteLyricActivity}
              onHide={hideChrome}
              onActivity={noteLyricActivity}
              onFastScrollDown={noteLyricActivity}
              onTopStateChange={setIsLyricAtTop}
            />

            <Animated.View
              style={[styles.floatingBottomControls, bottomChromeStyle]}
              pointerEvents={chromeVisible ? 'auto' : 'none'}
              onTouchStart={noteLyricActivity}
            >
              {/* 复制播放器大背景 + 渐变羽化蒙版，保证控制区背景与大背景无缝衔接并遮蔽歌词 */}
              <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: width,
                    height: height,
                  }}
                >
                  <CoverBackdrop artwork={current.artwork} />
                </View>
                <LinearGradient
                  colors={['rgba(15,15,15,0)', 'rgba(15,15,15,0.72)', 'rgba(15,15,15,0.94)']}
                  locations={[0, 0.28, 0.72]}
                  style={StyleSheet.absoluteFill}
                />
              </View>

              <View style={{ paddingHorizontal: spacing.xl }}>
                <PlayerDeck
                  current={current}
                  hideTitle={true}
                  onDismissWithAction={dismissWithAction}
                  onMenuOpenChange={setMenuOpen}
                />
              </View>
              <View style={[styles.toolbar, { paddingBottom: insets.bottom + spacing.xs }]}>
                <IconButton
                  name="lyrics"
                  size={iconSize.lg}
                  color={colors.iconMid}
                  isActive={true}
                  onPress={() => setMode('cover')}
                  accessibilityLabel="歌词"
                  style={styles.bottomIcon}
                />
                <View accessible accessibilityRole="button" accessibilityLabel="隔空播放">
                  <AirplayRouteButton style={styles.airplayNative} />
                </View>
                <IconButton
                  name="queue"
                  size={iconSize.lg}
                  color={colors.iconMid}
                  isActive={false}
                  onPress={() => setMode('list')}
                  accessibilityLabel="播放队列"
                  style={styles.bottomIcon}
                />
              </View>
            </Animated.View>
          </View>
        ) : (
          <>
            <View style={styles.page}>
              <View
                style={styles.stage}
                onLayout={(e) => {
                  stageHeight.value = e.nativeEvent.layout.height
                }}
              >
                <Animated.View
                  style={[StyleSheet.absoluteFill, queueAnimatedStyle]}
                  pointerEvents={mode === 'list' ? 'auto' : 'none'}
                >
                  <PlayerQueue
                    bottomSpace={0}
                    listAnim={listAnim}
                    stageTopOffset={stageTopOffset}
                    stageHeight={stageHeight}
                    onTopStateChange={setIsListAtTop}
                    onActionOpenChange={setQueueActionOpen}
                    onDismissWithAction={dismissWithAction}
                    onMenuOpenChange={setMenuOpen}
                    isMenuOpen={menuOpen}
                    createDismissPan={createDismissPan}
                    cardDismissGesture={headerDismissGesture}
                    translateY={translateY}
                    onDismiss={dismiss}
                  />
                </Animated.View>

                <Animated.View
                  pointerEvents={mode === 'cover' ? 'auto' : 'none'}
                  style={[StyleSheet.absoluteFill, styles.coverStage, coverAnimatedStyle]}
                >
                  <CoverImage resource={current.artwork} size={coverSize} borderRadius={radius.lg} />
                </Animated.View>
              </View>

              <Animated.View style={chromeStyle} pointerEvents={chromeVisible ? 'auto' : 'none'}>
                <View style={{ paddingHorizontal: spacing.xl }}>
                  <PlayerDeck
                    current={current}
                    listAnim={listAnim}
                    onDismissWithAction={dismissWithAction}
                    onMenuOpenChange={setMenuOpen}
                  />
                </View>
              </Animated.View>
            </View>

            <Animated.View
              style={[styles.toolbar, chromeStyle, { paddingBottom: insets.bottom + spacing.xs }]}
              pointerEvents={chromeVisible ? 'auto' : 'none'}
            >
              <IconButton
                name="lyrics"
                size={iconSize.lg}
                color={colors.iconMid}
                isActive={false}
                onPress={() => setMode('lyrics')}
                accessibilityLabel="歌词"
                style={styles.bottomIcon}
              />
              <View accessible accessibilityRole="button" accessibilityLabel="隔空播放">
                <AirplayRouteButton style={styles.airplayNative} />
              </View>
              <IconButton
                name="queue"
                size={iconSize.lg}
                color={colors.iconMid}
                isActive={mode === 'list'}
                onPress={() => setMode(mode === 'list' ? 'cover' : 'list')}
                accessibilityLabel="播放队列"
                style={styles.bottomIcon}
              />
            </Animated.View>
          </>
        )}

        {menuOpen ? (
          <Pressable
            style={[StyleSheet.absoluteFill, styles.menuScrim]}
            onPress={() => setMenuOpen(false)}
          />
        ) : null}
      </Animated.View>
      </GestureDetector>
    </AuthGate>
  )
}

function EmptyPlayerState({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={[styles.container, styles.center]}>
      <Text style={styles.empty}>还没有正在播放的歌曲</Text>
      <IconButton
        name="chevronDown"
        size={iconSize.xl}
        color={colors.iconMid}
        onPress={onDismiss}
        accessibilityLabel="收起播放页"
      />
    </View>
  )
}

function LyricPage({
  trackId,
  bottomSpace,
  controlsVisible,
  onReveal,
  onHide,
  onActivity,
  onFastScrollDown,
  onTopStateChange,
}: {
  trackId: string
  bottomSpace?: number
  controlsVisible?: boolean
  onReveal: () => void
  onHide?: () => void
  onActivity: () => void
  onFastScrollDown: () => void
  onTopStateChange?: (atTop: boolean) => void
}) {
  const progress = useProgress(LYRIC_TICK_MS)
  const current = usePlayerStore(selectCurrent)
  const seekAndPlay = useCallback(
    (seconds: number) => {
      void TrackPlayer.seekTo(seconds)
      void TrackPlayer.play()
      onActivity()
    },
    [onActivity],
  )
  return (
    <View style={styles.stageFill}>
      <LyricView
        trackId={trackId}
        positionMs={progress.position * 1000}
        onSeek={seekAndPlay}
        songTitle={current?.title}
        bottomSpace={bottomSpace}
        controlsVisible={controlsVisible}
        onFastScrollDown={onFastScrollDown}
        onScrollUp={onHide}
        onTopStateChange={onTopStateChange}
        onPullTop={onReveal}
        onScrollBeginDrag={onActivity}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { ...typography.subhead, color: colors.textSecondary },
  header: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.iconDim,
  },
  pinnedHeader: {
    zIndex: 10,
  },
  lyricsStage: {
    flex: 1,
    position: 'relative',
  },
  floatingBottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: spacing.lg,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  page: { flex: 1, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.lg },
  stage: { flex: 1 },
  stageFill: { flex: 1, paddingHorizontal: spacing.xl },
  coverStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xxl,
  },
  airplayNative: { width: 44, height: 44 },
  bottomIcon: { borderRadius: 12 },
  menuScrim: { backgroundColor: 'rgba(0, 0, 0, 0.001)', zIndex: 9999 },
})
