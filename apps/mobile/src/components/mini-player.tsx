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

const ARTWORK_SIZE = 44
const FRAME_SIZE = 48
const STROKE_WIDTH = 2
const ARTWORK_RADIUS = 6
/**
 * 48×48 紧密贴合描边路径（从 12 点钟方向顺时针）：
 * 画布 48×48，线宽 2pt，中心线内缩 1pt。
 * 中心线矩形范围：x: 1~47 (宽 46), y: 1~47 (高 46), 中心圆角 r = 7。
 * 外轮廓曲率 7 + 1 = 8，内边缘曲率 7 - 1 = 6。
 * 内部居中放置 44×44 封面 (圆角 6)，与进度描边内缘间距严格为 0pt，紧密贴合外包围。
 */
const STROKE_PATH =
  'M 24 1 L 40 1 A 7 7 0 0 1 47 8 L 47 40 A 7 7 0 0 1 40 47 L 8 47 A 7 7 0 0 1 1 40 L 1 8 A 7 7 0 0 1 8 1 L 24 1 Z'
/** 直线段 16 + 32 + 32 + 32 + 16 = 128，四角圆弧 2 * π * 7 ≈ 43.982，总周长 ≈ 171.982 */
const STROKE_PERIMETER = 128 + 14 * Math.PI

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
              {/* 进度高亮描边：深色模式纯白、浅色模式纯黑，秉持黑白灰为主原则 */}
              {ratio > 0.001 ? (
                <Path
                  d={STROKE_PATH}
                  stroke={colors.textPrimary}
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
