import { useToast } from '@/components/toast'
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useIsPlaying } from 'react-native-track-player'

import Animated, {
  Easing,
  Extrapolation,
  ReduceMotion,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { StatusBar } from 'expo-status-bar'
import * as ScreenOrientation from 'expo-screen-orientation'
import { PlayerToolbar } from '@/components/player/player-toolbar'
import { useLyricsControls } from '@/components/player/use-lyrics-controls'
import { PlayerModeLayer, PLAYER_MODE_TIMING } from '@/components/player/player-mode-transition'
import { PlayerLandscapeView } from '@/components/player/player-landscape-view'
import { LyricPage } from '@/components/player/lyric-page'
import { AuthGate } from '@/lib/auth-gate'
import { CoverBackdrop } from '@/components/player/cover-backdrop'
import { ImmersiveDarkOverlay, ViewportCover } from '@/components/player/immersive-cover'
import { IconButton, iconSize } from '@/components/icon'
import { usePlaybackIntent } from '@/player/playback-intent'
import { useIsAudioLoading } from '@/player/use-audio-loading'
import { PlayerDeck, PlayerTitleRow } from '@/components/player/player-deck'
import { closeOpenQueueAction, CurrentTrackCard, PlayerQueue } from '@/components/player/player-queue'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { DarkThemeScope } from '@/theme/theme-provider'
import { resolveAmbientPalette } from '@/theme/ambient-palette'
import { getThemeColors, radius, spacing, typography } from '@/theme/tokens'

const PAUSED_COVER_SCALE = 0.86

type PlayerMode = 'cover' | 'lyrics' | 'list'

export default function PlayerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [, setScreenOrient] = useState<ScreenOrientation.Orientation | null>(null)

  // 播放页方向管理：进入播放页解锁重力感应全向旋转；离开时恢复并锁定为竖屏
  useEffect(() => {
    void ScreenOrientation.unlockAsync().catch(() => {})
    void ScreenOrientation.getOrientationAsync().then(setScreenOrient).catch(() => {})
    const sub = ScreenOrientation.addOrientationChangeListener((evt) => {
      setScreenOrient(evt.orientationInfo.orientation)
    })
    return () => {
      ScreenOrientation.removeOrientationChangeListener(sub)
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {})
    }
  }, [])

  const isLandscape = width > height
  
  const current = usePlayerStore(selectCurrent)
  const { playing } = useIsPlaying()
  const isAudioLoading = useIsAudioLoading()
  const networkWaiting = usePlaybackIntent((state) => state.waitingForNetwork)
  const playbackEnded = usePlayerStore((state) => state.playbackEnded)
  const palette = useMemo(
    () => resolveAmbientPalette(current?.trackId ?? current?.coverId),
    [current?.trackId, current?.coverId],
  )

  const params = useLocalSearchParams<{ mode?: PlayerMode }>()
  const [mode, setMode] = useState<PlayerMode>(
    params.mode === 'lyrics' || params.mode === 'list' ? params.mode : 'cover',
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [lyricsReadiness, setLyricsReadiness] = useState<{ identity: string; ready: boolean; error: boolean }>({ identity: '', ready: false, error: false })
  const [lyricsModalOpen, setLyricsModalOpen] = useState(false)
  const [routePickerOpen, setRoutePickerOpen] = useState(false)
  const [playbackRequestPending, setPlaybackRequestPending] = useState(false)
  const adjustHandler = useRef<() => void>(() => {})
  const registerAdjustHandler = useCallback((handler: () => void) => { adjustHandler.current = handler }, [])
  const [lyricAdjustAvailable, setLyricAdjustAvailable] = useState(false)
  const [portraitChromeHeight, setPortraitChromeHeight] = useState(0)
  const [toolbarHeight, setToolbarHeight] = useState(0)
  const [pinnedHeaderHeight, setPinnedHeaderHeight] = useState(0)
  const lyricsIdentity = current?.qid ?? ''
  const lyricsReadyForCurrent = lyricsReadiness.identity === lyricsIdentity && lyricsReadiness.ready
  const lyricsErrorForCurrent = lyricsReadiness.identity === lyricsIdentity && lyricsReadiness.error
  const controls = useLyricsControls({
    active: mode === 'lyrics',
    identity: lyricsIdentity,
    playing: Boolean(playing),
    ready: lyricsReadyForCurrent,
    locked: lyricsModalOpen || routePickerOpen || menuOpen,
    forceVisible: playbackEnded || !lyricsReadyForCurrent || lyricsErrorForCurrent || isAudioLoading || networkWaiting || playbackRequestPending || (!playing && !isAudioLoading && !networkWaiting),
  })
  const updateLyricsReady = useCallback((ready: boolean) => {
    setLyricsReadiness((previous) => ({ identity: lyricsIdentity, ready, error: ready ? false : previous.identity === lyricsIdentity && previous.error }))
  }, [lyricsIdentity])
  const updateLyricsError = useCallback((error: boolean) => {
    setLyricsReadiness((previous) => ({ identity: lyricsIdentity, ready: previous.identity === lyricsIdentity && previous.ready, error }))
  }, [lyricsIdentity])
  const [showImmersionHint, setShowImmersionHint] = useState(true)
  useEffect(() => {
    if (mode !== 'lyrics' || controls.visible || !showImmersionHint) return
    const timer = setTimeout(() => setShowImmersionHint(false), 3000)
    return () => clearTimeout(timer)
  }, [mode, controls.visible, showImmersionHint])
  const controlsOpacity = useSharedValue(1)
  useEffect(() => {
    controlsOpacity.value = withTiming(controls.visible ? 1 : 0, {
      duration: controls.visible ? 360 : 500,
      easing: controls.visible ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    })
  }, [controls.visible, controlsOpacity])
  const chromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: (1 - controlsOpacity.value) * 48 }],
  }))

  useEffect(() => {
    if (params.mode === 'lyrics' || params.mode === 'list' || params.mode === 'cover') {
      setMode(params.mode)
    }
  }, [params.mode])

  // 1. 同步预估舞台高度，确保首帧计算出的封面尺寸与测量后 100% 一致，避免入场中途 setState 触发重渲染
  const initialStageHeight = useMemo(() => {
    const pageH = height || 850
    const top = insets.top + spacing.sm + 50 + spacing.xs
    const bottom = insets.bottom + spacing.xs + 80
    return Math.max(320, pageH - top - bottom - 190)
  }, [height, insets.top, insets.bottom])

  const stageHeight = useSharedValue(initialStageHeight)
  const stageTopOffset = insets.top + spacing.sm + 50 + spacing.xs

  const coverAnim = useSharedValue(mode === 'cover' ? 1 : 0)
  const listAnim = useSharedValue(0)
  const lyricAnim = useSharedValue(0)
  const coverScale = useSharedValue(playing === false ? PAUSED_COVER_SCALE : 1)

  useEffect(() => {
    if (playing === undefined) return
    coverScale.value = withTiming(playing ? 1 : PAUSED_COVER_SCALE, {
      duration: 320,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      reduceMotion: ReduceMotion.System,
    })
  }, [playing, coverScale])

  const coverScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coverScale.value }],
  }))

  // Apple 级流体动量曲线（前快后慢、自然阻尼，杜绝顿挫）
  useEffect(() => {
    const timingConfig = PLAYER_MODE_TIMING
    coverAnim.value = withTiming(mode === 'cover' ? 1 : 0, timingConfig)

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
  }, [mode, coverAnim, listAnim, lyricAnim])

  const dismiss = useCallback(() => router.back(), [router])

  const translateY = useSharedValue(height || 850)
  const startY = useSharedValue(0)
  const [isListAtTop, setIsListAtTop] = useState(true)
  const [queueActionOpen, setQueueActionOpen] = useState(false)

  // 一旦进入或进场后预热，列表与歌词层保留固定布局；非当前层通过 hit-testing 和辅助功能隔离。
  const [hasEnteredList, setHasEnteredList] = useState(mode === 'list')
  const [hasEnteredLyrics, setHasEnteredLyrics] = useState(mode === 'lyrics')

  // 播放页进场动画 (360ms) 完成后，后台空闲预热挂载列表和歌词，确保首次点击时已在内存中就绪
  useEffect(() => {
    const listTimer = setTimeout(() => {
      setHasEnteredList(true)
    }, 400)
    const lyricsTimer = setTimeout(() => {
      setHasEnteredLyrics(true)
    }, 650)
    return () => {
      clearTimeout(listTimer)
      clearTimeout(lyricsTimer)
    }
  }, [])

  useEffect(() => {
    if (mode === 'list') {
      setIsListAtTop(true)
      setHasEnteredList(true)
    }
    if (mode === 'lyrics') {
      setHasEnteredLyrics(true)
    }
  }, [mode])

  // 播放器进场动效
  useEffect(() => {
    translateY.value = withTiming(0, {
      duration: 360,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
    })
  }, [translateY])

  const createDismissPan = useCallback((enabled: boolean) =>
    Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY(8)
      .failOffsetY(-15)
      .onTouchesDown(() => {
        if (!queueActionOpen) return
        runOnJS(closeOpenQueueAction)()
        runOnJS(setQueueActionOpen)(false)
      })
      .onBegin(() => {
        // 若在进场动画期间触摸，立即中止当前动画并锚定当前位置
        translateY.value = translateY.value
      })
      .onStart(() => {
        startY.value = translateY.value
      })
      .onUpdate((event) => {
        const next = startY.value + event.translationY
        translateY.value = Math.max(0, next)
      })
      .onEnd((event) => {
        const pageHeight = height || 850
        // 动量投射：结合当前位移与松手瞬时速度（Apple Music / iOS 原生交互物理法则）
        const projectedY = translateY.value + event.velocityY * 0.15
        const shouldDismiss =
          (projectedY > 130 && translateY.value > 25) ||
          (translateY.value > 150) ||
          (event.velocityY > 500 && translateY.value > 15)

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
      }), [height, translateY, startY, dismiss, queueActionOpen])

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

  const isDismissEnabled = useMemo(
    () =>
      !menuOpen && mode !== 'lyrics' &&
      (mode === 'cover' || isListAtTop),
    [menuOpen, mode, isListAtTop],
  )

  const dismissGesture = useMemo(
    () => createDismissPan(isDismissEnabled),
    [createDismissPan, isDismissEnabled],
  )
  // 每个 GestureDetector 独占实例，避免顶部把手和歌曲卡片互相覆盖原生绑定。
  const handleDismissGesture = useMemo(
    () => createDismissPan(!menuOpen),
    [createDismissPan, menuOpen],
  )
  const headerDismissGesture = useMemo(
    () => createDismissPan(!menuOpen),
    [createDismissPan, menuOpen]
  )
  const lyricHeaderDismissGesture = useMemo(
    () => createDismissPan(!menuOpen && mode === 'lyrics'),
    [createDismissPan, menuOpen, mode],
  )
  const coverDismissGesture = useMemo(
    () => createDismissPan(!menuOpen && mode === 'cover'),
    [createDismissPan, menuOpen, mode]
  )

  // 动态圆角：有 Safe Area（iPhone X+）用适度圆角，无 Safe Area（旧机型/安卓）用直角
  // 避免滑动时圆角渐变的视觉问题，同时在不同机型上都显得自然
  const hasSafeArea = insets.top > 20
  const topCornerRadius = hasSafeArea ? 20 : 0

  const rootAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: topCornerRadius,
    borderTopRightRadius: topCornerRadius,
  }))

  // 两个目标共用退场权重，封面退出的运动不随目标变化。
  const coverAnimatedStyle = useAnimatedStyle(() => {
    const progress = 1 - coverAnim.value
    return {
      opacity: interpolate(progress, [0, 0.7], [1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(progress, [0, 1], [1, 0.94], Extrapolation.CLAMP) }],
    }
  })

  // 沉浸式全屏封面：仅在 cover 态完全显露，平滑过渡到底层的 CoverBackdrop
  // 遮罩只做透明度过渡，保持背景几何尺寸稳定。
  const immersiveCoverStyle = useAnimatedStyle(() => {
    const activeProg = 1 - coverAnim.value
    const opacity = interpolate(activeProg, [0, 0.95], [1, 0], Extrapolation.CLAMP)
    return { opacity }
  })

  const lyricSettingsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lyricAnim.value, [0, 0.85], [0, 1], Extrapolation.CLAMP) * controlsOpacity.value,
    transform: [{ translateY: (1 - controlsOpacity.value) * 48 }],
  }))

  const toast = useToast()
  const showControls = controls.show
  const requestPlaybackAction = useCallback((action: () => Promise<unknown>, fallback: string) => {
    showControls()
    setPlaybackRequestPending(true)
    void action().catch((error: unknown) => toast(error instanceof Error ? error.message : fallback)).finally(() => setPlaybackRequestPending(false))
  }, [showControls, toast])
  const recordLayoutHeight = useCallback((setHeight: Dispatch<SetStateAction<number>>) => (event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height)
    setHeight((previous) => Math.abs(previous - height) > 1 ? height : previous)
  }, [])
  const onPortraitChromeLayout = useMemo(() => recordLayoutHeight(setPortraitChromeHeight), [recordLayoutHeight])
  const onToolbarLayout = useMemo(() => recordLayoutHeight(setToolbarHeight), [recordLayoutHeight])
  const onPinnedHeaderLayout = useMemo(() => recordLayoutHeight(setPinnedHeaderHeight), [recordLayoutHeight])
  const bottomChromeInset = portraitChromeHeight + toolbarHeight + 6 + 44 + spacing.xl


  if (!current) {
    return (
      <DarkThemeScope>
        <StatusBar style="light" />
        <EmptyPlayerState onDismiss={dismiss} />
      </DarkThemeScope>
    )
  }

  if (isLandscape) {
    return (
      <DarkThemeScope>
        <StatusBar hidden={true} />
        <AuthGate group="protected">
          <GestureDetector gesture={dismissGesture}>
            <Animated.View style={[styles.root, rootAnimatedStyle]}>
              <CoverBackdrop artwork={current.artwork} palette={palette} />
              <ImmersiveDarkOverlay />
              <PlayerLandscapeView
                current={current}
                palette={palette}
                mode={mode}
                onModeChange={setMode}
                onDismiss={dismiss}
                onDismissWithAction={dismissWithAction}
                onMenuOpenChange={setMenuOpen}
                isMenuOpen={menuOpen}
                coverScaleStyle={coverScaleStyle}
                coverAnim={coverAnim}
                listAnim={listAnim}
                lyricAnim={lyricAnim}
                hasEnteredList={hasEnteredList}
                hasEnteredLyrics={hasEnteredLyrics}
                handleDismissGesture={handleDismissGesture}
                coverDismissGesture={handleDismissGesture}
                translateY={translateY}
                playing={playing}
                controlsVisible={controls.visible}
                controlsOpacity={controlsOpacity}
                foreground={controls.foreground}
                followLocked={lyricsModalOpen || routePickerOpen || menuOpen || isAudioLoading || networkWaiting || playbackRequestPending}
                onLyricsReadyChange={updateLyricsReady}
                onLyricsErrorChange={updateLyricsError}
                onInteractionStart={controls.touchStart}
                onInteractionEnd={controls.touchEnd}
                onShareOpenChange={setLyricsModalOpen}
                onRoutePickerVisibilityChange={setRoutePickerOpen}
                onBlankTap={controls.toggle}
                onFlingReveal={controls.show}
                onListTopStateChange={setIsListAtTop}
              />
              {menuOpen ? (
                <Pressable
                  style={[StyleSheet.absoluteFill, styles.menuScrim]}
                  onPress={() => setMenuOpen(false)}
                />
              ) : null}
            </Animated.View>
          </GestureDetector>
        </AuthGate>
      </DarkThemeScope>
    )
  }

  return (
    <DarkThemeScope>
      <StatusBar style="light" />
      <AuthGate group="protected">
      <GestureDetector gesture={dismissGesture}>
        <Animated.View style={[styles.root, rootAnimatedStyle, { paddingTop: insets.top + spacing.sm }]}>
          <CoverBackdrop artwork={current.artwork} palette={palette} />
          {/* 沉浸式暗化渐变遮罩：在 CoverBackdrop 之上、内容之下，切歌词/列表时平滑淡出 */}
          <Animated.View style={[StyleSheet.absoluteFill, immersiveCoverStyle]} pointerEvents="none">
            <ImmersiveDarkOverlay />
          </Animated.View>

          <GestureDetector gesture={handleDismissGesture}>
            <View style={styles.header} collapsable={false}>
              <View style={styles.dragHandle} />
            </View>
          </GestureDetector>

          {/* 中间舞台容器：涵盖封面/列表层与歌词层，两层绝对覆盖实现平滑深度转场 */}
          <View style={styles.stageViewport}>
            {/* 封面与播放列表层 */}
            <Animated.View
              style={[StyleSheet.absoluteFill, { paddingBottom: toolbarHeight + portraitChromeHeight + spacing.lg }]}
              pointerEvents={mode !== 'lyrics' ? 'auto' : 'none'}
              accessibilityElementsHidden={mode === 'lyrics'}
              importantForAccessibility={mode === 'lyrics' ? 'no-hide-descendants' : 'auto'}
            >
              <View style={styles.page}>
                <View
                  style={styles.stage}
                  onLayout={(e) => {
                    const h = Math.round(e.nativeEvent.layout.height)
                    if (Math.abs(stageHeight.value - h) > 2) {
                      stageHeight.value = h
                    }
                  }}
                >
                  <PlayerModeLayer progress={listAnim} active={mode === 'list'}>
                    {hasEnteredList ? (
                      <PlayerQueue
                        palette={palette}
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
                    ) : null}
                  </PlayerModeLayer>

                  <Animated.View
                    pointerEvents={mode === 'cover' ? 'auto' : 'none'}
                    style={[StyleSheet.absoluteFill, styles.coverStage, coverAnimatedStyle]}
                    accessibilityElementsHidden={mode !== 'cover'}
                    importantForAccessibility={mode === 'cover' ? 'auto' : 'no-hide-descendants'}
                  >
                    <GestureDetector gesture={coverDismissGesture}>
                      <View style={styles.coverGestureContainer}>
                        {/* 视口核心舞台：导航栏底部至歌名行顶部，按屏幕宽度展示专辑图 */}
                        <View style={styles.coverImageWrapper}>
                          <Animated.View style={[styles.coverScaleLayer, coverScaleStyle]}>
                            <ViewportCover artwork={current.artwork} coverId={current.coverId} />
                          </Animated.View>
                        </View>
                        <View style={styles.titleRowWrapper}>
                          <PlayerTitleRow
                            current={current}
                            onDismissWithAction={dismissWithAction}
                            onMenuOpenChange={setMenuOpen}
                          />
                        </View>
                      </View>
                    </GestureDetector>
                  </Animated.View>
                </View>
              </View>
            </Animated.View>

            {/* 歌词层 */}
            <PlayerModeLayer progress={lyricAnim} active={mode === 'lyrics'}>
              <Animated.View
                style={styles.pinnedHeaderOverlay}
                pointerEvents="auto">
                <GestureDetector gesture={lyricHeaderDismissGesture}>
                  <View style={styles.pinnedHeader} collapsable={false} onLayout={onPinnedHeaderLayout}>
                    {hasEnteredLyrics ? (
                      <CurrentTrackCard
                        item={current}
                        consumeOpenAction={() => false}
                        onDismissWithAction={dismissWithAction}
                        onMenuOpenChange={setMenuOpen}
                      />
                    ) : null}
                  </View>
                </GestureDetector>
              </Animated.View>

              <View style={styles.lyricsStage}>
                {hasEnteredLyrics ? (
                  <LyricPage
                    key={current.qid}
                    trackId={current.trackId}
                    bottomSpace={bottomChromeInset}
                    active={mode === 'lyrics'}
                    translateY={translateY}
                    onDismiss={dismiss}
                    playing={playing}
                    immersive
                    stageMask={{ opacity: controlsOpacity, topInset: pinnedHeaderHeight, bottomInset: bottomChromeInset, topFloor: pinnedHeaderHeight, bottomFloor: insets.bottom }}
                    controlsVisible={controls.visible}
                    foreground={controls.foreground}
                    followLocked={lyricsModalOpen || routePickerOpen || menuOpen || isAudioLoading || networkWaiting || playbackRequestPending}
                    onFlingReveal={controls.show}
                    onLyricsReadyChange={updateLyricsReady}
                    onLyricsErrorChange={updateLyricsError}
                    onInteractionStart={controls.touchStart}
                    onInteractionEnd={controls.touchEnd}
                    onShareOpenChange={setLyricsModalOpen}
                    onModalOpenChange={setLyricsModalOpen}
                    onAdjustAvailabilityChange={setLyricAdjustAvailable}
                    onRegisterAdjustHandler={registerAdjustHandler}
                    onBlankTap={controls.toggle}
                  />
                ) : null}
              </View>
            </PlayerModeLayer>
          </View>

          <Animated.View
            style={[styles.lyricSettingsRow, { bottom: toolbarHeight + portraitChromeHeight + 6 + spacing.xl }, lyricSettingsAnimatedStyle]}
            pointerEvents={mode === 'lyrics' && controls.visible ? 'auto' : 'none'}
            accessibilityElementsHidden={mode !== 'lyrics' || !controls.visible}
            importantForAccessibility={mode === 'lyrics' && controls.visible ? 'auto' : 'no-hide-descendants'}>
            <IconButton name="lyricAdjust" size={iconSize.lg} color={lyricAdjustAvailable ? darkColors.iconMid : darkColors.textTertiary}
              disabled={!lyricAdjustAvailable} onPress={() => adjustHandler.current()} accessibilityLabel="调整歌词时间" />
          </Animated.View>
          <Animated.View
            onLayout={onPortraitChromeLayout}
            style={[styles.portraitLyricsControls, { bottom: toolbarHeight + 6 }, mode === 'lyrics' ? chromeAnimatedStyle : undefined]}
            pointerEvents={mode === 'lyrics' && !controls.visible ? 'none' : 'auto'}
            accessibilityElementsHidden={mode === 'lyrics' && !controls.visible}
            importantForAccessibility={mode === 'lyrics' && !controls.visible ? 'no-hide-descendants' : 'auto'}>
            <PlayerDeck current={current} hideTitle
              onAction={mode === 'lyrics' ? requestPlaybackAction : undefined}
              onInteractionStart={mode === 'lyrics' ? controls.touchStart : undefined}
              onInteractionEnd={mode === 'lyrics' ? controls.touchEnd : undefined}
            />
          </Animated.View>

          {mode === 'lyrics' && !controls.visible ? (
            <Pressable
              style={[styles.hiddenControlsTapZone, { bottom: insets.bottom }]}
              onPress={controls.toggle}
              accessibilityRole="button"
              accessibilityLabel="显示播放控制"
            >
              {showImmersionHint ? <Text style={styles.immersionHint}>轻点空白处显示控制</Text> : null}
            </Pressable>
          ) : null}
          <Animated.View
            onLayout={onToolbarLayout}
            style={[styles.lyricsToolbarOverlay, mode === 'lyrics' ? chromeAnimatedStyle : undefined]}
            pointerEvents={mode === 'lyrics' && !controls.visible ? 'none' : 'auto'}
            accessibilityElementsHidden={mode === 'lyrics' && !controls.visible}
            importantForAccessibility={mode === 'lyrics' && !controls.visible ? 'no-hide-descendants' : 'auto'}>
            <PlayerToolbar mode={mode} onModeChange={(next) => { if (next === 'lyrics') controls.show(); setMode(next) }} bottomInset={insets.bottom} onRoutePickerVisibilityChange={setRoutePickerOpen} />
          </Animated.View>

          {menuOpen ? (
            <Pressable
              style={[StyleSheet.absoluteFill, styles.menuScrim]}
              onPress={() => setMenuOpen(false)}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </AuthGate>
  </DarkThemeScope>
  )
}

function EmptyPlayerState({ onDismiss }: { onDismiss: () => void }) {
  const colors = darkColors
  return (
    <View style={[styles.root, styles.center]}>
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

const darkColors = getThemeColors('dark')

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bgPrimary },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { ...typography.subhead, color: darkColors.textSecondary },
  header: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xs,
    // 拖动小横条往上移（-12 再 -10 = -22）
    marginTop: -22,
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: darkColors.iconDim,
  },
  stageViewport: {
    flex: 1,
    position: 'relative',
  },
  pinnedHeaderOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  pinnedHeader: { zIndex: 10 },
  portraitLyricsControls: { position: 'absolute', left: 0, right: 0, paddingHorizontal: spacing.xl },
  lyricSettingsRow: { position: 'absolute', right: spacing.xl, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  hiddenControlsTapZone: { position: 'absolute', left: 0, right: 0, height: 44, zIndex: 8, alignItems: 'center', justifyContent: 'center' },
  immersionHint: { ...typography.caption, color: darkColors.textTertiary },
  lyricsToolbarOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10 },
  lyricsStage: { flex: 1, position: 'relative' },
  // paddingBottom 再减 10（lg 16 → 6）：播放器整块再下移 10pt，更贴底部工具栏
  page: { flex: 1, paddingTop: spacing.xs, paddingBottom: 6, gap: spacing.lg },
  stage: { flex: 1 },
  stageFill: { flex: 1, paddingHorizontal: spacing.xl },
  lyricActions: { position: 'absolute', right: spacing.xl, bottom: 24, zIndex: 20 },
  coverGestureContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  coverStage: {
    flex: 1,
    justifyContent: 'space-between',
  },
  coverImageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverScaleLayer: { width: '100%', alignItems: 'center' },
  titleRowWrapper: {
    paddingHorizontal: spacing.xl,
  },
  menuScrim: { backgroundColor: 'rgba(0, 0, 0, 0.001)', zIndex: 9999 },
})
