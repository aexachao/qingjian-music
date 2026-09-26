import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useRouter, useSegments } from 'expo-router'
import { useIsPlaying, useProgress } from 'react-native-track-player'
import Svg, { Path } from 'react-native-svg'
import { CoverImage } from '@/components/cover-image'
import { IconButton, iconSize } from '@/components/icon'
import { MarqueeText } from '@/components/marquee-text'
import { tap } from '@/lib/haptics'
import { skipToNextSafe, togglePlay } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { useIsAudioLoading } from '@/player/use-audio-loading'
import { radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'

const ARTWORK_SIZE = 40
const FRAME_SIZE = 48
const STROKE_WIDTH = 2
const ARTWORK_RADIUS = 5
/**
 * 48×48 外部描边路径（从 12 点钟方向顺时针）：
 * 画布 48×48，线宽 2pt，中心线内缩 1pt。
 * 中心线矩形范围：x: 1~47 (宽 46), y: 1~47 (高 46), 内圆角 r = 8。
 * 外轮廓曲率 8 + 1 = 9，内边缘曲率 8 - 1 = 7。
 * 内部居中放置 40×40 封面 (圆角 5)，四周留 2pt 悬浮微缝，同心圆角严格等距。
 */
const STROKE_PATH =
  'M 24 1 L 39 1 A 8 8 0 0 1 47 9 L 47 39 A 8 8 0 0 1 39 47 L 9 47 A 8 8 0 0 1 1 39 L 1 9 A 8 8 0 0 1 9 1 L 24 1 Z'
/** 直线段 15 + 30 + 30 + 30 + 15 = 120，四角圆弧 2 * π * 8 ≈ 50.265，总周长 ≈ 170.265 */
const STROKE_PERIMETER = 120 + 16 * Math.PI

/** iOS 有真毛玻璃（UIVisualEffectView），Android 上 BlurView 不可靠 —— 所以两端一律用实心底，不引入 BlurView */

/**
 * 迷你播放条：固定贴在页签上方，点击进入正在播放页。
 *
 * 底色必须**挡住**下面滚动的内容——之前用白 10% 的半透明，列表文字会透上来，
 * 和背景糊在一起。现在 iOS 是「毛玻璃 + 深色蒙层」，Android 是实心底，
 * 再加一圈描边把它和页面分开。封面四周顺时针呈现圆角矩形描边显示播放进度。
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
          <View style={styles.artworkWrapper}>
            <CoverImage resource={current.artwork} size={ARTWORK_SIZE} borderRadius={ARTWORK_RADIUS} />
            <Svg
              width={FRAME_SIZE}
              height={FRAME_SIZE}
              viewBox={`0 0 ${FRAME_SIZE} ${FRAME_SIZE}`}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              {/* 浅灰底轨：外部环绕封面 */}
              <Path
                d={STROKE_PATH}
                stroke={colors.playerProgressTrack}
                strokeWidth={STROKE_WIDTH}
                fill="none"
              />
              {/* 品牌色进度高亮描边：从 12 点钟方向顺时针推进 */}
              {ratio > 0.001 ? (
                <Path
                  d={STROKE_PATH}
                  stroke={colors.playing}
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${STROKE_PERIMETER} ${STROKE_PERIMETER}`}
                  strokeDashoffset={STROKE_PERIMETER * (1 - ratio)}
                />
              ) : null}
            </Svg>
          </View>
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
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
  },
  artworkWrapper: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  text: { flex: 1, gap: 2 },
  title: { ...typography.subhead, color: colors.textPrimary },
  artist: { ...typography.caption, color: colors.textSecondary },
}))
