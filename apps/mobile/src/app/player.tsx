import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import { AirplayRouteButton } from '../../modules/airplay-button'
import { CoverImage } from '@/components/cover-image'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { LyricView } from '@/components/lyric-view'
import { CoverBackdrop } from '@/components/player/cover-backdrop'
import { PageIndicator } from '@/components/player/page-indicator'
import { PlayerDeck } from '@/components/player/player-deck'
import { PlayerQueue } from '@/components/player/player-queue'
import { useToast } from '@/components/toast'
import { formatOffset, OFFSET_STEP_MS, useLyricOffset } from '@/lib/lyric-offset'
import { clearQueue } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 三页：歌词 / 播放器 / 播放队列，进来停在中间那页 */
const LYRICS_PAGE = 0
const PLAYER_PAGE = 1
const QUEUE_PAGE = 2
const PAGE_LABELS = ['歌词', '正在播放', '播放队列']
/** 进来停在哪一页 */
const INITIAL_PAGE = PLAYER_PAGE
/** 暂停时封面缩到多大（Apple Music 的呼吸感） */
const PAUSED_SCALE = 0.82
/** 只反弹一次：阻尼比调高，别来回晃 */
const COVER_SPRING = { duration: 420, dampingRatio: 0.72 }
/** 歌词页无操作多久后进入全屏歌词 */
const CHROME_HIDE_DELAY_MS = 2000
const CHROME_FADE_MS = 260
/** 歌词逐字点亮要比进度条更细的刷新 */
const LYRIC_TICK_MS = 200

/**
 * 正在播放页：导航栏（收起 + 页码指示器）/ 三页横滑区 / 底部工具栏。
 * 左右滑动在歌词、播放器、播放队列之间切换，底部工具栏的图标跟着高亮。
 * 歌词页播放中静置两秒会把周边收起来，只剩歌词（点一下回来）。
 */
export default function PlayerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const current = usePlayerStore(selectCurrent)
  const { playing } = useIsPlaying()
  const toast = useToast()
  const [page, setPage] = useState(INITIAL_PAGE)
  const pager = useRef<ScrollView>(null)
  const { offsetMs, adjust, canAdjust } = useLyricOffset(current?.trackId ?? '')

  // 播放时封面满尺寸，暂停时缩小
  const scale = useSharedValue(playing ? 1 : PAUSED_SCALE)
  useEffect(() => {
    scale.value = withSpring(playing ? 1 : PAUSED_SCALE, COVER_SPRING)
  }, [playing, scale])
  const coverStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  // 周边（导航栏 / 播放器组件 / 工具栏）的显隐
  const [chromeVisible, setChromeVisible] = useState(true)
  const [touchedAt, setTouchedAt] = useState(0)
  const chrome = useSharedValue(1)
  // 首次布局量下来的自然高度：收起时按它插值到 0，歌词才能撑满整屏
  const headerHeight = useSharedValue(0)
  const toolbarHeight = useSharedValue(0)
  const deckHeight = useSharedValue(0)

  useEffect(() => {
    chrome.value = withTiming(chromeVisible ? 1 : 0, { duration: CHROME_FADE_MS })
  }, [chromeVisible, chrome])

  // 歌词页 + 正在播放 + 静置两秒 → 收起
  useEffect(() => {
    if (page !== LYRICS_PAGE || !playing || !chromeVisible) return
    const timer = setTimeout(() => setChromeVisible(false), CHROME_HIDE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [page, playing, chromeVisible, touchedAt])

  // 离开歌词页或暂停时立刻恢复（暂停要长显）
  useEffect(() => {
    if (page === LYRICS_PAGE && playing) return
    setChromeVisible(true)
  }, [page, playing])

  /** 任何触摸都算「有操作」：只捕获、不接手，滑动切页不受影响 */
  const onUserTouch = useCallback(() => {
    if (page !== LYRICS_PAGE) return
    setChromeVisible(true)
    setTouchedAt(Date.now())
  }, [page])

  // 三块周边各自按「自然高度 × 显隐进度」收起；量到高度之前只做淡入淡出
  const headerAnim = useAnimatedStyle(() =>
    headerHeight.value > 0
      ? { opacity: chrome.value, height: headerHeight.value * chrome.value }
      : { opacity: chrome.value },
  )
  const toolbarAnim = useAnimatedStyle(() =>
    toolbarHeight.value > 0
      ? { opacity: chrome.value, height: toolbarHeight.value * chrome.value }
      : { opacity: chrome.value },
  )
  const deckAnim = useAnimatedStyle(() =>
    deckHeight.value > 0
      ? { opacity: chrome.value, height: deckHeight.value * chrome.value }
      : { opacity: chrome.value },
  )

  const goToPage = useCallback(
    (next: number) => {
      pager.current?.scrollTo({ x: next * width, animated: true })
      setPage(next)
    },
    [width],
  )

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.round(event.nativeEvent.contentOffset.x / width))
    },
    [width],
  )

  const dismiss = useCallback(() => router.back(), [router])
  /** 往下拖 100 点以上收起播放页；横向交给翻页容器，两边不抢手势 */
  const dismissGesture = Gesture.Pan()
    .activeOffsetY([-9999, 20])
    .failOffsetX([-24, 24])
    .onEnd((event) => {
      if (event.translationY > 100) runOnJS(dismiss)()
    })

  const adjustLyric = useCallback(
    (deltaMs: number) => {
      adjust(deltaMs)
      toast(`歌词偏移 ${formatOffset(offsetMs + deltaMs)}`)
    },
    [adjust, offsetMs, toast],
  )

  /** 「···」快捷菜单：iOS 用系统操作表，Android（M7）先用 Alert 兜底 */
  const onMore = useCallback(() => {
    if (!current) return
    const actions: { label: string; run: () => void; destructive?: boolean }[] = []
    if (current.albumId) {
      actions.push({
        label: '查看专辑',
        // 用 replace：跳走时把播放页收起来，回退键回到原来的页面（迷你条还在底部）
        run: () => router.replace({ pathname: '/library/album/[id]', params: { id: current.albumId! } }),
      })
    }
    if (current.artistId) {
      actions.push({
        label: '查看艺术家',
        run: () => router.replace({ pathname: '/library/artist/[id]', params: { id: current.artistId! } }),
      })
    }
    if (canAdjust) {
      actions.push({ label: '歌词提前 0.5 秒', run: () => adjustLyric(OFFSET_STEP_MS) })
      actions.push({ label: '歌词延后 0.5 秒', run: () => adjustLyric(-OFFSET_STEP_MS) })
      if (offsetMs !== 0) actions.push({ label: '歌词偏移归零', run: () => adjustLyric(-offsetMs) })
    }
    actions.push({
      label: '清空队列',
      destructive: true,
      run: () => {
        void clearQueue()
        router.back()
      },
    })

    const message = canAdjust ? `歌词偏移 ${formatOffset(offsetMs)}` : undefined
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...actions.map((action) => action.label), '取消'],
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: actions.findIndex((action) => action.destructive),
          userInterfaceStyle: 'dark',
          title: current.title,
          ...(message ? { message } : {}),
        },
        (selected) => actions[selected]?.run(),
      )
      return
    }
    Alert.alert(current.title, message, [
      ...actions.map((action) => ({
        text: action.label,
        style: action.destructive ? ('destructive' as const) : ('default' as const),
        onPress: action.run,
      })),
      { text: '取消', style: 'cancel' },
    ])
  }, [adjustLyric, canAdjust, current, offsetMs, router])

  if (!current) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.empty}>还没有正在播放的歌曲</Text>
        <IconButton
          name="chevronDown"
          size={iconSize.xl}
          color={colors.iconMid}
          onPress={dismiss}
          accessibilityLabel="收起播放页"
        />
      </View>
    )
  }

  const coverSize = Math.min(width - spacing.xl * 2, 420)

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + spacing.sm }]}
      onStartShouldSetResponderCapture={() => {
        onUserTouch()
        return false
      }}
    >
      {/* 背景：当前封面放大模糊，颜色跟着封面走 */}
      <CoverBackdrop artwork={current.artwork} />

      <Animated.View
        style={[styles.header, headerAnim]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
        onLayout={(event) => {
          if (headerHeight.value === 0) headerHeight.value = event.nativeEvent.layout.height
        }}
      >
        <IconButton
          name="chevronDown"
          size={iconSize.xl}
          color={colors.iconMid}
          onPress={dismiss}
          accessibilityLabel="收起播放页"
        />
        <View style={styles.headerCenter}>
          <PageIndicator count={3} index={page} onSelect={goToPage} labels={PAGE_LABELS} />
        </View>
        {/* 与左侧收起按钮同宽，指示器才是真正居中的 */}
        <View style={styles.headerSpacer} />
      </Animated.View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: INITIAL_PAGE * width, y: 0 }}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        <View style={[styles.page, { width }]}>
          <View style={styles.stage}>
            <LyricPage trackId={current.trackId} />
          </View>
          <Animated.View style={deckAnim} pointerEvents={chromeVisible ? 'auto' : 'none'}>
            <PlayerDeck current={current} onMore={onMore} />
          </Animated.View>
        </View>

        <View style={[styles.page, { width }]}>
          {/* 封面区可以下滑收起：整屏浮层没有系统自带的下拉关闭 */}
          <GestureDetector gesture={dismissGesture}>
            <View style={[styles.stage, styles.coverStage]}>
              <Animated.View style={coverStyle}>
                <CoverImage resource={current.artwork} size={coverSize} borderRadius={radius.lg} />
              </Animated.View>
            </View>
          </GestureDetector>
          {/* 这一份 deck 永远不收起，正好用它的高度作为歌词页收起动画的基准 */}
          <View
            onLayout={(event) => {
              if (deckHeight.value === 0) deckHeight.value = event.nativeEvent.layout.height
            }}
          >
            <PlayerDeck current={current} onMore={onMore} />
          </View>
        </View>

        <View style={[styles.page, { width }]}>
          <PlayerQueue bottomSpace={spacing.md} />
        </View>
      </ScrollView>

      <Animated.View
        style={[styles.toolbar, { paddingBottom: insets.bottom + spacing.xs }, toolbarAnim]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
        onLayout={(event) => {
          if (toolbarHeight.value === 0) toolbarHeight.value = event.nativeEvent.layout.height
        }}
      >
        <IconButton
          name="lyrics"
          size={iconSize.lg}
          color={page === LYRICS_PAGE ? colors.accent : colors.iconMid}
          onPress={() => goToPage(page === LYRICS_PAGE ? PLAYER_PAGE : LYRICS_PAGE)}
          accessibilityLabel="歌词"
        />
        {/* 隔空播放：图标还是 App 自己那套，点击交给盖在上面的系统 AVRoutePickerView。
            原生视图 alpha 不能给 0，UIKit 不会给全透明视图派发点击。 */}
        <View style={styles.airplay} accessible accessibilityRole="button" accessibilityLabel="隔空播放">
          <Icon name="airplay" size={iconSize.lg} color={colors.iconMid} />
          <AirplayRouteButton style={styles.airplayPicker} />
        </View>
        <IconButton
          name="queue"
          size={iconSize.lg}
          color={page === QUEUE_PAGE ? colors.accent : colors.iconMid}
          onPress={() => goToPage(page === QUEUE_PAGE ? PLAYER_PAGE : QUEUE_PAGE)}
          accessibilityLabel="播放队列"
        />
      </Animated.View>
    </View>
  )
}

/** 歌词页单独拆开：进度每 200ms 一变，别让整个播放页跟着重渲染 */
function LyricPage({ trackId }: { trackId: string }) {
  const progress = useProgress(LYRIC_TICK_MS)
  return (
    <LyricView
      trackId={trackId}
      positionMs={progress.position * 1000}
      onSeek={(seconds) => void TrackPlayer.seekTo(seconds)}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { ...typography.subhead, color: colors.textSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  pager: { flex: 1 },
  // 每一页自己留左右边距，翻页容器必须是整屏宽
  page: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg },
  // 上半部分（封面 / 歌词）用同一个容器，两页下方组件的位置才完全一致
  stage: { flex: 1 },
  coverStage: { alignItems: 'center', justifyContent: 'center' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xxl,
    overflow: 'hidden',
  },
  airplay: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  airplayPicker: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.02 },
})
