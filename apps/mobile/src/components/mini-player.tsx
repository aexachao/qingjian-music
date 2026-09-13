import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useRouter, useSegments } from 'expo-router'
import { useIsPlaying, useProgress } from 'react-native-track-player'
import { CoverImage } from '@/components/cover-image'
import { IconButton, iconSize } from '@/components/icon'
import { MarqueeText } from '@/components/marquee-text'
import { tap } from '@/lib/haptics'
import { skipToNextSafe, togglePlay } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { useIsAudioLoading } from '@/player/use-audio-loading'
import { radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'

/** 底部进度线的高度 */
const PROGRESS_HEIGHT = 2

/** iOS 有真毛玻璃（UIVisualEffectView），Android 上 BlurView 不可靠 —— 所以两端一律用实心底，不引入 BlurView */

/**
 * 迷你播放条：固定贴在页签上方，点击进入正在播放页。
 *
 * 底色必须**挡住**下面滚动的内容——之前用白 10% 的半透明，列表文字会透上来，
 * 和背景糊在一起。现在 iOS 是「毛玻璃 + 深色蒙层」，Android 是实心底，
 * 再加一圈描边把它和页面分开。底部一条 2pt 的细线显示播放进度。
 * 固定停靠在底部，不使用任何入场/出场/位移动画。
 */
export function MiniPlayer() {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
  const router = useRouter()
  const segments = useSegments()
  const isPlayerOpen = segments[0] === 'player'

  const current = usePlayerStore(selectCurrent)
  const playbackEnded = usePlayerStore((s) => s.playbackEnded)
  const { playing } = useIsPlaying()
  const isAudioLoading = useIsAudioLoading()
  const progress = useProgress(500)

  if (!current) return null

  const ratio = playbackEnded
    ? 1
    : progress.duration > 0
    ? Math.min(Math.max(progress.position / progress.duration, 0), 1)
    : 0

  const togglePlayWithHaptics = () => {
    tap()
    void togglePlay()
  }

  return (
    <View
      style={styles.shell}
      pointerEvents={isPlayerOpen ? 'none' : 'auto'}
    >
      {Platform.OS === 'ios' && <BlurView intensity={80} tint={mode === 'dark' ? 'systemThickMaterialDark' : 'systemThickMaterialLight'} style={StyleSheet.absoluteFill} />}
        
        <Pressable
          style={styles.container}
          onPress={() => router.push('/player')}
          accessibilityRole="button"
          accessibilityLabel={`正在播放 ${current.title}，点击展开播放页`}
        >
          <CoverImage resource={current.artwork} size={44} borderRadius={radius.sm} />
          <View style={styles.text}>
            <MarqueeText text={current.title} style={styles.title} />
            <Text numberOfLines={1} style={styles.artist}>
              {current.artistText}
            </Text>
          </View>
          {/* 次级控制用 lg，命中区由 IconButton 撑到 44×44 */}
          <IconButton
            name={playing ? 'pause' : 'play'}
            size={iconSize.lg}
            color={colors.iconBright}
            loading={isAudioLoading}
            onPress={togglePlayWithHaptics}
            accessibilityLabel={playing ? '暂停' : '播放'}
          />
          <IconButton
            name="next"
            size={iconSize.lg}
            color={colors.iconMid}
            onPress={() => {
              tap()
              void skipToNextSafe()
            }}
            accessibilityLabel="下一首"
          />
        </Pressable>
        {/* 底部细进度线：轨道铺满，填充按比例增长（对齐 Apple Music 迷你条） */}
        {ratio > 0 ? (
          <View style={styles.progressTrack} pointerEvents="none">
            <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
          </View>
        ) : null}
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  shell: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
    // overflow 必须裁掉，否则毛玻璃会画到圆角外面
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bgFloatingSolid,
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
}))
