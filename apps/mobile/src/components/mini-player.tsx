import { useEffect } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useRouter, useSegments } from 'expo-router'
import Animated, {
  Easing,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useIsPlaying, useProgress } from 'react-native-track-player'
import { CoverImage } from '@/components/cover-image'
import { IconButton, iconSize } from '@/components/icon'
import { skipToNextSafe, togglePlay } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 往左滑多远算下一首（pt） */
const SWIPE_SLOP = 48
/** 底部进度线的高度 */
const PROGRESS_HEIGHT = 2

/** iOS 有真毛玻璃（UIVisualEffectView），Android 上 BlurView 不可靠，直接用实心底 */
const USE_BLUR = Platform.OS === 'ios'

/**
 * 迷你播放条：贴在页签上方，点击进入正在播放页。
 *
 * 底色必须**挡住**下面滚动的内容——之前用白 10% 的半透明，列表文字会透上来，
 * 和背景糊在一起。现在 iOS 是「毛玻璃 + 深色蒙层」，Android 是实心底，
 * 再加一圈描边把它和页面分开。底部一条 2pt 的细线显示播放进度。
 */
export function MiniPlayer() {
  const router = useRouter()
  const segments = useSegments()
  const isPlayerOpen = segments[0] === 'player'

  const current = usePlayerStore(selectCurrent)
  const { playing } = useIsPlaying()
  const progress = useProgress(500)

  const translateY = useSharedValue(0)
  const opacity = useSharedValue(1)

  useEffect(() => {
    if (isPlayerOpen) {
      // 展开全屏播放页时：迷你条向下滑出隐藏并渐隐
      translateY.value = withTiming(80, {
        duration: 320,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      })
      opacity.value = withTiming(0, { duration: 220 })
    } else {
      // 退出全屏播放页时：迷你条从下方平滑升起重现
      translateY.value = withTiming(0, {
        duration: 420,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      })
      opacity.value = withTiming(1, { duration: 320 })
    }
  }, [isPlayerOpen])

  const playerTransitionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  if (!current) return null

  const ratio = progress.duration > 0 ? Math.min(Math.max(progress.position / progress.duration, 0), 1) : 0

  const togglePlayWithHaptics = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void togglePlay()
  }

  return (
    <Animated.View 
      style={[styles.shell, playerTransitionStyle]}
      pointerEvents={isPlayerOpen ? 'none' : 'auto'}
      entering={SlideInDown.duration(380).easing(Easing.bezier(0.25, 1, 0.5, 1))} 
      exiting={SlideOutDown.duration(280).easing(Easing.bezier(0.25, 1, 0.5, 1))}
    >
      {Platform.OS === 'ios' && <BlurView intensity={80} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />}
        
        <Pressable
          style={styles.container}
          onPress={() => router.push('/player')}
          accessibilityRole="button"
          accessibilityLabel={`正在播放 ${current.title}，点击展开播放页`}
        >
          <CoverImage resource={current.artwork} size={44} borderRadius={radius.sm} />
          <View style={styles.text}>
            <Text numberOfLines={1} style={styles.title}>
              {current.title}
            </Text>
            <Text numberOfLines={1} style={styles.artist}>
              {current.artistText}
            </Text>
          </View>
          {/* 次级控制用 lg，命中区由 IconButton 撑到 44×44 */}
          <IconButton
            name={playing ? 'pause' : 'play'}
            size={iconSize.lg}
            color={colors.iconBright}
            onPress={togglePlayWithHaptics}
            accessibilityLabel={playing ? '暂停' : '播放'}
          />
          <IconButton
            name="next"
            size={iconSize.lg}
            color={colors.iconMid}
            onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void skipToNextSafe(); }}
            accessibilityLabel="下一首"
          />
        </Pressable>
        {/* 底部细进度线：轨道铺满，填充按比例增长（对齐 Apple Music 迷你条） */}
        {ratio > 0 ? (
          <View style={styles.progressTrack} pointerEvents="none">
            <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
          </View>
        ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
    // overflow 必须裁掉，否则毛玻璃会画到圆角外面
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : '#1c1c1e',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 2 },
  title: { ...typography.subhead, color: colors.textPrimary },
  artist: { ...typography.caption, color: colors.textSecondary },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: PROGRESS_HEIGHT,
    backgroundColor: colors.playerProgressTrack,
  },
  progressFill: { height: PROGRESS_HEIGHT, backgroundColor: colors.iconBright },
})
