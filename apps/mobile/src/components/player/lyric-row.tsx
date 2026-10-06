import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { Pressable, Text } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import type { LyricLine } from '@qj/core-domain'
import { Icon, iconSize } from '@/components/icon'
import { longPress as hapticLongPress, select as hapticSelect } from '@/lib/haptics'
import { LONG_PRESS_MS, LYRIC_MOTION } from '@/lib/lyric-karaoke'
import { fonts, spacing, radius, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

export interface LyricRowProps {
  index: number
  line: LyricLine
  /** 正在唱的这一句 */
  active: boolean
  viewActive: boolean
  /** 正在被点击/选中的这一句 */
  selected?: boolean
  /**
   * 当前唱到的连续字数（浮点）：
   * 卡拉OK行（文件带逐词时间）给数字 → 逐字平滑扫亮；
   * 其余给 undefined → 整行高亮（信息行 / 没有逐词数据的普通 LRC）。
   */
  litProgress?: number
  synced: boolean
  renderKaraoke: boolean
  onTap: (index: number, atMs: number) => void
  onLongPress: (index: number) => void
  onPressIn: (index: number) => void
  onPressOut: (index: number) => void
  onLayout: (index: number, y: number, height: number) => void
}

/**
 * 卡拉OK单字：颜色按「已唱字数 lit」与自身字序的距离在 UI 线程平滑插值（pending→sung）。
 * 嵌在父 Text 里保证排版与换行正常。
 */
const KaraokeChar = memo(function KaraokeChar({
  char,
  index,
  lit,
  focus,
  sungColor,
  pendingColor,
}: {
  char: string
  index: number
  lit: SharedValue<number>
  focus: SharedValue<number>
  sungColor: string
  pendingColor: string
}) {
  const animStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], [
      sungColor,
      interpolateColor(lit.value, [index, index + 1], [pendingColor, sungColor]),
    ]),
  }))
  return <Animated.Text style={animStyle}>{char}</Animated.Text>
})

export const LyricRow = memo(function LyricRow({
  index,
  line,
  active,
  viewActive,
  selected = false,
  litProgress,
  synced,
  renderKaraoke,
  onTap,
  onLongPress,
  onPressIn,
  onPressOut,
  onLayout,
}: LyricRowProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const reduceMotion = useReducedMotion()
  // 仅当前行与相邻过渡行使用逐字节点，避免整首长歌词创建数千个动画订阅。
  // 自然换行时上一行保留文本树，随焦点渐隐；远离当前行后恢复普通文本。
  const untimedMetadata = line.atMs < 0
  const seekable = synced && !untimedMetadata
  const karaoke = seekable && renderKaraoke
  const chars = useMemo(() => karaoke ? Array.from(line.text ?? '') : [], [karaoke, line.text])

  // 卡拉OK平滑扫过：把「已唱字数(浮点)」放进 UI 线程 SharedValue，
  // 每次位置 tick(≈100ms) 来时用同周期线性插值，避免反复重启动画造成拖尾，
  // 每个字的颜色按 lit 与字序的距离平滑插值（带 1 个字的柔边）。
  const lit = useSharedValue(litProgress ?? 0)
  const previousLitProgress = useRef<number | undefined>(undefined)
  useEffect(() => {
    const previous = previousLitProgress.current
    previousLitProgress.current = litProgress
    if (litProgress === undefined) return
    // 重新进入/倒退 seek 直接对齐；只对正常向前推进做插值，避免反向扫亮。
    lit.value = reduceMotion || !viewActive || previous === undefined || litProgress < previous
      ? litProgress
      : withTiming(litProgress, { duration: LYRIC_MOTION.wordMs, easing: Easing.linear })
  }, [litProgress, lit, reduceMotion, viewActive])

  const focused = !untimedMetadata && synced && active
  const activeAnim = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    activeAnim.value = viewActive && !reduceMotion ? withTiming(focused ? 1 : 0, {
      duration: LYRIC_MOTION.focusMs,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    }) : focused ? 1 : 0
  }, [focused, viewActive, activeAnim, reduceMotion])

  const animatedContentStyle = useAnimatedStyle(() => {
    const scale = reduceMotion ? 1 : interpolate(activeAnim.value, [0, 1], [LYRIC_MOTION.restingScale, 1.0])
    const opacity = interpolate(activeAnim.value, [0, 1], [0.38, 1.0])
    return {
      opacity: selected ? 1.0 : !synced ? 0.68 : opacity,
      transform: [{ scale: !synced ? 1 : scale }],
    }
  })

  const animatedTranslationStyle = useAnimatedStyle(() => ({
    color: selected ? colors.textPrimary : interpolateColor(
      activeAnim.value, [0, 1], [colors.textSecondary, colors.textPrimary],
    ),
  }))

  const handlePress = useCallback(() => {
    hapticSelect()
    onTap(index, line.atMs)
  }, [onTap, index, line.atMs])

  const handleLongPress = useCallback(() => {
    hapticLongPress()
    onLongPress(index)
  }, [onLongPress, index])

  return (
    <Pressable
      onPress={seekable ? handlePress : undefined}
      onPressIn={() => onPressIn(index)}
      onPressOut={() => onPressOut(index)}
      onLongPress={handleLongPress}
      delayLongPress={LONG_PRESS_MS}
      onLayout={(event) => onLayout(index, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
      accessibilityRole={seekable ? 'button' : 'text'}
      accessibilityActions={[{ name: 'showLyrics', label: '选择分享歌词' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'showLyrics') handleLongPress()
      }}
      accessibilityLabel={`${line.text}${active ? '（正在播放）' : ''}${seekable ? '，点按从这句开始播放，长按选择分享歌词' : '，长按选择分享歌词'}`}
      style={[
        styles.rowContainer,
        selected && styles.rowSelected,
      ]}
    >
      <Animated.View style={[styles.rowInner, animatedContentStyle]}>
        {line.text ? (
          <Text
            style={[
              styles.line,
              active && !karaoke && styles.lineActive,
              karaoke && styles.lineKaraoke,
              selected && styles.lineSelected,
            ]}
          >
            {karaoke
              ? chars.map((char, index) => (
                  <KaraokeChar
                    key={index}
                    char={char}
                    index={index}
                    lit={lit}
                    focus={activeAnim}
                    sungColor={colors.textPrimary}
                    pendingColor={colors.textTertiary}
                  />
                ))
              : line.text}
          </Text>
        ) : (
          // 前奏 / 间奏这类空行用声波图标占位，不用音符字符
          <Icon name="playing" size={iconSize.lg} color={active ? colors.playing : colors.iconDim} />
        )}
        {line.translation ? (
          <Animated.Text style={[styles.translation, animatedTranslationStyle]}>
            {line.translation}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </Pressable>
  )
})

const useStyles = createThemedStyles((colors) => ({
  // —— 歌词行容器与选中浅色矩形板 ——
  rowContainer: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowSelected: {
    backgroundColor: colors.bgListItem,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  rowInner: {
    width: '100%',
    alignSelf: 'stretch',
    transformOrigin: 'left center',
  },

  // —— 歌词文字：保持统一 28pt 行高 40，杜绝重排抖动，通过 GPU 缩放与透明度实现丝滑聚焦 ——
  line: {
    fontSize: 28,
    lineHeight: 40,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  // 正在唱的整行：纯白高亮，拉开视觉对比
  lineActive: {
    fontSize: 28,
    lineHeight: 40,
    color: colors.textPrimary,
  },
  // 卡拉OK当前行：唱到的字逐字纯白
  lineKaraoke: {
    fontSize: 28,
    lineHeight: 40,
    color: colors.textPrimary,
  },
  // 选中的那一行（点击/长按反馈）：变纯白清晰
  lineSelected: {
    color: colors.textPrimary,
  },

  // —— 翻译 ——
  translation: {
    ...typography.subhead,
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
}))
