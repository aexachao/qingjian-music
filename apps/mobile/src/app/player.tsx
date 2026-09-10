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
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { AirplayRouteButton } from '../../modules/airplay-button'
import { AuthGate } from '@/lib/auth-gate'
import { CoverImage } from '@/components/cover-image'
import { CoverBackdrop } from '@/components/player/cover-backdrop'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { LyricView } from '@/components/lyric-view'
import { PlayerDeck, PlayerTitleRow } from '@/components/player/player-deck'
import { closeOpenQueueAction, CurrentTrackCard, PlayerQueue } from '@/components/player/player-queue'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

const LYRIC_TICK_MS = 200

type PlayerMode = 'cover' | 'lyrics' | 'list'

export default function PlayerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  
  const current = usePlayerStore(selectCurrent)

  const [mode, setMode] = useState<PlayerMode>('cover')
  const [menuOpen, setMenuOpen] = useState(false)
  const [stageMeasuredHeight, setStageMeasuredHeight] = useState(0)
  const stageHeight = useSharedValue(440)
  const stageTopOffset = insets.top + spacing.sm + 50 + spacing.xs

  const listAnim = useSharedValue(0)
  const lyricAnim = useSharedValue(0)

  useEffect(() => {
    const timingConfig = {
      duration: 320,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    }

    if (mode === 'list') {
      listAnim.value = withTiming(1, timingConfig)
      lyricAnim.value = withTiming(0, timingConfig)
    } else if (mode === 'lyrics') {
      listAnim.value = withTiming(0, timingConfig)
      lyricAnim.value = withTiming(1, timingConfig)
    } else {
      listAnim.value = withTiming(0, timingConfig)
      lyricAnim.value = withTiming(0, timingConfig)
    }
  }, [mode, listAnim, lyricAnim])

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

  const maxCoverHeight = stageMeasuredHeight > 0 ? stageMeasuredHeight - 76 : 420
  const coverSize = Math.max(160, Math.min(width - spacing.xl * 2, maxCoverHeight))

  const queueAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(listAnim.value, [0.08, 0.9], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(listAnim.value, [0, 1], [1.04, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(listAnim.value, [0, 1], [20, 0], Extrapolation.CLAMP) },
    ],
  }))

  const coverAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(listAnim.value, [0, 1], [1, 0.90], Extrapolation.CLAMP)
    const opacity = interpolate(listAnim.value, [0, 0.85], [1, 0], Extrapolation.CLAMP)
    return {
      opacity,
      transform: [{ scale }],
    }
  })

  const coverListContainerAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(lyricAnim.value, [0, 0.85], [1, 0], Extrapolation.CLAMP)
    const scale = interpolate(lyricAnim.value, [0, 1], [1, 0.90], Extrapolation.CLAMP)
    return {
      opacity,
      transform: [{ scale }],
    }
  })

  const lyricsContainerAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(lyricAnim.value, [0.08, 0.9], [0, 1], Extrapolation.CLAMP)
    const scale = interpolate(lyricAnim.value, [0, 1], [1.04, 1], Extrapolation.CLAMP)
    const translateY = interpolate(lyricAnim.value, [0, 1], [20, 0], Extrapolation.CLAMP)
    return {
      opacity,
      transform: [{ scale }, { translateY }],
    }
  })

  const pinnedHeaderAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(lyricAnim.value, [0.1, 1], [-14, 0], Extrapolation.CLAMP)
    const opacity = interpolate(lyricAnim.value, [0.15, 0.9], [0, 1], Extrapolation.CLAMP)
    return {
      opacity,
      transform: [{ translateY }],
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
            <View style={styles.header}>
              <View style={styles.dragHandle} />
            </View>
          </GestureDetector>

          {/* 中间舞台容器：涵盖封面/列表层与歌词层，两层绝对覆盖实现平滑深度转场 */}
          <View style={styles.stageViewport}>
            {/* 封面与播放列表层 */}
            <Animated.View
              style={[StyleSheet.absoluteFill, coverListContainerAnimatedStyle]}
              pointerEvents={mode !== 'lyrics' ? 'auto' : 'none'}
            >
              <View style={styles.page}>
                <View
                  style={styles.stage}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height
                    stageHeight.value = h
                    setStageMeasuredHeight(h)
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
                    <View style={styles.coverImageWrapper}>
                      <CoverImage resource={current.artwork} size={coverSize} borderRadius={radius.lg} />
                    </View>
                    <View style={styles.titleRowWrapper}>
                      <PlayerTitleRow
                        current={current}
                        onDismissWithAction={dismissWithAction}
                        onMenuOpenChange={setMenuOpen}
                      />
                    </View>
                  </Animated.View>
                </View>

                <View style={{ paddingHorizontal: spacing.xl }}>
                  <PlayerDeck
                    current={current}
                    listAnim={listAnim}
                    hideTitle={true}
                    onDismissWithAction={dismissWithAction}
                    onMenuOpenChange={setMenuOpen}
                  />
                </View>
              </View>
            </Animated.View>

            {/* 歌词层 */}
            <Animated.View
              style={[StyleSheet.absoluteFill, lyricsContainerAnimatedStyle]}
              pointerEvents={mode === 'lyrics' ? 'auto' : 'none'}
            >
              <Animated.View style={pinnedHeaderAnimatedStyle}>
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
              </Animated.View>

              <View style={styles.lyricsStage}>
                <LyricPage
                  trackId={current.trackId}
                  bottomSpace={48 + insets.bottom}
                  onTopStateChange={setIsLyricAtTop}
                  active={mode === 'lyrics'}
                  translateY={translateY}
                  onDismiss={dismiss}
                />
              </View>
            </Animated.View>
          </View>

          {/* 底部工具栏常驻 */}
          <View style={[styles.toolbar, { paddingBottom: insets.bottom + spacing.xs }]}>
            <IconButton
              name="lyrics"
              size={iconSize.lg}
              color={colors.iconMid}
              isActive={mode === 'lyrics'}
              onPress={() => setMode(mode === 'lyrics' ? 'cover' : 'lyrics')}
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
          </View>

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
  onTopStateChange,
  active,
  translateY,
  onDismiss,
}: {
  trackId: string
  bottomSpace?: number
  onTopStateChange?: (atTop: boolean) => void
  active?: boolean
  translateY?: SharedValue<number>
  onDismiss?: () => void
}) {
  const { playing } = useIsPlaying()
  const progress = useProgress(active ? LYRIC_TICK_MS : 1000)
  const current = usePlayerStore(selectCurrent)
  const seekAndPlay = useCallback((seconds: number) => {
    void TrackPlayer.seekTo(seconds)
    void TrackPlayer.play()
  }, [])
  return (
    <View style={styles.stageFill}>
      <LyricView
        trackId={trackId}
        positionMs={progress.position * 1000}
        onSeek={seekAndPlay}
        songTitle={current?.title}
        bottomSpace={bottomSpace}
        onTopStateChange={onTopStateChange}
        active={active}
        translateY={translateY}
        onDismiss={onDismiss}
        playing={playing}
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
  stageViewport: {
    flex: 1,
    position: 'relative',
  },
  pinnedHeader: {
    zIndex: 10,
  },
  lyricsStage: {
    flex: 1,
    position: 'relative',
  },
  page: { flex: 1, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.lg },
  stage: { flex: 1 },
  stageFill: { flex: 1, paddingHorizontal: spacing.xl },
  coverStage: {
    flex: 1,
    justifyContent: 'space-between',
  },
  coverImageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  titleRowWrapper: {
    paddingHorizontal: spacing.xl,
  },
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
