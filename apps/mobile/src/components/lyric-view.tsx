import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useIsPlaying } from 'react-native-track-player'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import type { LyricLine } from '@qj/core-domain'
import { ErrorState } from '@/components/list-states'
import { Icon, iconSize, IconButton } from '@/components/icon'
import { useLyricSheet } from '@/lib/lyric-offset'
import { usePlayerStore } from '@/player/store'
import { colors, fonts, radius, spacing, typography } from '@/theme/tokens'

/** 没有下一行时，假设当前行唱这么久（逐词进度的兜底） */
const FALLBACK_LINE_MS = 4000
/** 长按多久弹出全部歌词面板 */
const LONG_PRESS_MS = 320
/** 列表已停在顶部还继续往下拽超过多少 pt，算「要退出全屏」 */
const PULL_REVEAL_PT = 36

/** 卡拉OK行里还没唱到的字用这个灰（唱到的字是纯白） */
const PENDING_CHAR = '#ffffff99'

/** 跨组件与切页持久缓存的行坐标与视口高度，避免切回歌词页重新排版导致的滚动跳跃 */
const trackOffsetsCache = new Map<string, number[]>()
let lastKnownViewportHeight = 0

interface LyricViewProps {
  trackId: string
  /** 当前播放进度（毫秒） */
  positionMs: number
  /** 点了某一行：跳到那一句开始播（播放与否由调用方决定） */
  onSeek: (seconds: number) => void
  /** 弹「全部歌词」面板时顶部显示的歌名（分享文本里也要用） */
  songTitle?: string
  /** 底部工具栏占位高度（用于空状态提示词居中与歌词底边距） */
  bottomSpace?: number
  /** 列表是否停在顶部 */
  onTopStateChange?: (atTop: boolean) => void
  /** 列表停在顶部还继续往下拽（overscroll）时触发 */
  onPullTop?: () => void
  /** 手指开始拖动列表 */
  onScrollBeginDrag?: () => void
  /** 当前歌词页是否处于前台显示状态 */
  active?: boolean
  /** 播放器模态框全局下拉位移 */
  translateY?: SharedValue<number>
  /** 模态框退出退场回调 */
  onDismiss?: () => void
  /** 是否正在播放：暂停时自由滑动不自动回弹，恢复播放后立即平滑居中到当前时间戳歌词 */
  playing?: boolean
}

/** 找到当前该高亮的行：最后一个开始时间 <= 当前时间的行 */
function activeIndexOf(lines: LyricLine[], atMs: number): number {
  let index = -1
  for (let i = 0; i < lines.length; i += 1) {
    if ((lines[i]?.atMs ?? 0) <= atMs) index = i
    else break
  }
  return index
}

/**
 * 这一行是不是卡拉OK行：文件里给了一行内的逐词时间（增强型 LRC）才算，
 * 用「下一个词的开始时间」而不是平均拍脑袋，才能跟得上人声。
 */
function isKaraokeLine(line: LyricLine): boolean {
  return Array.isArray(line.words) && line.words.length >= 2
}

/**
 * 当前唱到第几个字。逐词推进：
 * 每个词里的字均分「这个词到下一个词」的时间，唱到哪个字的开始时间就亮到哪。
 */
function countLitChars(line: LyricLine, atMs: number, nextLineAtMs: number): number {
  const words = line.words ?? []
  if (words.length === 0) return 0
  let lit = 0
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!
    const wordChars = Array.from(word.text)
    const spanStart = word.atMs
    const spanEnd = words[i + 1]?.atMs ?? nextLineAtMs
    const span = Math.max(spanEnd - spanStart, 1)
    for (let c = 0; c < wordChars.length; c += 1) {
      const charAt = spanStart + (span * c) / wordChars.length
      if (charAt <= atMs) lit += 1
    }
  }
  return lit
}

export function LyricView({
  trackId,
  positionMs,
  onSeek,
  songTitle,
  bottomSpace,
  onTopStateChange,
  onPullTop,
  onScrollBeginDrag,
  active = true,
  translateY,
  onDismiss,
  playing: playingProp,
}: LyricViewProps) {
  const hookPlaying = useIsPlaying()
  const playing = playingProp !== undefined ? playingProp : Boolean(hookPlaying?.playing)
  const { height: screenHeight } = useWindowDimensions()
  const offsetMs = usePlayerStore((state) => state.lyricOffsetMs)
  const scrollRef = useRef<ScrollView>(null)
  const offsets = useRef<number[]>(trackOffsetsCache.get(trackId) ?? [])
  const [viewportHeight, setViewportHeight] = useState(lastKnownViewportHeight)
  /** 用户手指按压下的行（按下显示圆角矩形板，手指离开后立即消失） */
  const [pressingRowIndex, setPressingRowIndex] = useState<number | null>(null)
  /** 长按某一行 → 弹全部歌词面板，并把那一行滚到可见 */
  const [sheetOpenFor, setSheetOpenFor] = useState<number | null>(null)

  const query = useLyricSheet(trackId)
  const sheet = query.data ?? null
  const lines = sheet?.lines ?? []
  const synced = sheet?.synced ?? false

  const atMs = positionMs + offsetMs
  const activeIndex = useMemo(() => (synced ? activeIndexOf(lines, atMs) : -1), [lines, atMs, synced])

  // 计算初始滚动偏移量，确保首帧直达当前播放行，绝不从 0 滚下
  const initialScrollY = useMemo(() => {
    const cached = trackOffsetsCache.get(trackId)
    if (!cached || activeIndex < 0 || cached[activeIndex] === undefined) return 0
    const vh = lastKnownViewportHeight || 500
    const effectiveH = Math.max(vh - (bottomSpace ?? 0), 120)
    return Math.max(cached[activeIndex]! - effectiveH * 0.38, 0)
  }, [trackId, activeIndex, bottomSpace])

  const scrollY = useSharedValue(initialScrollY)
  const isAtTopRef = useSharedValue(true)
  const isDismissing = useSharedValue(false)
  const dragStartedAtTopRef = useSharedValue(false)

  // 当前行是卡拉OK行时，唱到第几个字（整行高亮的行用不上）
  const activeKaraoke = activeIndex >= 0 && synced && isKaraokeLine(lines[activeIndex]!)
  const litCount = useMemo(() => {
    if (!activeKaraoke || activeIndex < 0) return undefined
    const nextAt = lines[activeIndex + 1]?.atMs ?? (lines[activeIndex]?.atMs ?? 0) + FALLBACK_LINE_MS
    return countLitChars(lines[activeIndex]!, atMs, nextAt)
  }, [activeKaraoke, activeIndex, atMs, lines])

  // —— 手势防冲突与视口跟随 ——
  const currentScrollY = useRef(initialScrollY)
  const isInteractingRef = useRef(false)
  const userManualOverrideRef = useRef(false)
  const idleResumeTimer = useRef<NodeJS.Timeout | null>(null)
  const prevActiveRef = useRef(active)
  const prevActiveIndexRef = useRef(activeIndex)
  const hasPositionedForCurrentTrackRef = useRef(false)

  const clearIdleResumeTimer = useCallback(() => {
    if (idleResumeTimer.current) {
      clearTimeout(idleResumeTimer.current)
      idleResumeTimer.current = null
    }
  }, [])

  // 切歌时重置手势与位移状态
  useEffect(() => {
    offsets.current = trackOffsetsCache.get(trackId) ?? []
    currentScrollY.current = 0
    isInteractingRef.current = false
    userManualOverrideRef.current = false
    clearIdleResumeTimer()
    hasPositionedForCurrentTrackRef.current = false
    prevActiveIndexRef.current = -1
  }, [trackId, clearIdleResumeTimer])

  useEffect(() => {
    return clearIdleResumeTimer
  }, [clearIdleResumeTimer])

  const scrollToActiveIndex = useCallback(
    (index: number, options?: { animated?: boolean; forceCenter?: boolean }) => {
      const animated = options?.animated ?? true
      const forceCenter = options?.forceCenter ?? false
      if (!synced || index < 0 || viewportHeight <= 0) return
      const targetY = offsets.current[index]
      if (targetY === undefined) return

      const effectiveHeight = Math.max(viewportHeight - (bottomSpace ?? 0), 120)

      // 1. 手指按住、拖拽或惯性滑动中：硬锁定，绝对不自动滚动视口
      if (isInteractingRef.current) return

      // 2. 用户松手后的宽容视口态（未超时冷却恢复前）：
      if (userManualOverrideRef.current && !forceCenter) {
        const scrollY = currentScrollY.current
        const safeTop = scrollY + 40
        const safeBottom = scrollY + effectiveHeight - 40

        // 若当前/新高亮行仍在舒适视口内，跳过滚动，仅在原地高亮，不打扰用户视线
        if (targetY >= safeTop && targetY <= safeBottom) {
          return
        }
      }

      // 3. 正常自动跟随或已超出舒适安全区：定位到上黄金分割位（约 38% 视口高）
      const targetScroll = Math.max(targetY - effectiveHeight * 0.38, 0)
      currentScrollY.current = targetScroll
      scrollRef.current?.scrollTo({ y: targetScroll, animated })
    },
    [synced, viewportHeight, bottomSpace],
  )

  const startIdleResumeTimer = useCallback(() => {
    clearIdleResumeTimer()
    // 暂停状态下自由滑动，不启动闲置恢复计时器，滑动到哪儿就是哪儿
    if (!playing) return
    idleResumeTimer.current = setTimeout(() => {
      userManualOverrideRef.current = false
      if (activeIndex >= 0) {
        scrollToActiveIndex(activeIndex, { animated: true, forceCenter: false })
      }
    }, 3500)
  }, [clearIdleResumeTimer, playing, activeIndex, scrollToActiveIndex])

  const prevPlayingRef = useRef(playing)
  // 恢复播放时：若之前有过手动滑动，立即平滑跳转到当前时间戳对应的歌词行
  useEffect(() => {
    const justResumed = playing && !prevPlayingRef.current
    prevPlayingRef.current = playing

    if (justResumed) {
      userManualOverrideRef.current = false
      clearIdleResumeTimer()
      if (activeIndex >= 0 && viewportHeight > 0) {
        scrollToActiveIndex(activeIndex, { animated: true, forceCenter: true })
      }
    } else if (!playing) {
      // 从播放切换到暂停时，若之前有挂起的闲置定时器，立即清除，保持暂停停留位置
      clearIdleResumeTimer()
    }
  }, [playing, activeIndex, viewportHeight, clearIdleResumeTimer, scrollToActiveIndex])

  // 当用户切入歌词页（active: false -> true）时，立即无动画直达当前播放行
  useEffect(() => {
    const justActivated = active && !prevActiveRef.current
    prevActiveRef.current = active

    if (justActivated) {
      userManualOverrideRef.current = false
      if (activeIndex >= 0 && viewportHeight > 0) {
        scrollToActiveIndex(activeIndex, { animated: false, forceCenter: true })
      }
    }
  }, [active, activeIndex, viewportHeight, scrollToActiveIndex])

  // 高亮行自然推进或首帧就绪时的滚动判定
  useEffect(() => {
    // 首次在当前视口获得尺寸与对应行高度时，进行首次无动画定位
    if (!hasPositionedForCurrentTrackRef.current) {
      if (viewportHeight > 0 && activeIndex >= 0 && offsets.current[activeIndex] !== undefined) {
        scrollToActiveIndex(activeIndex, { animated: false, forceCenter: true })
        hasPositionedForCurrentTrackRef.current = true
      }
      return
    }

    // 后台非激活态下不触发滚动
    if (!active) return

    // 暂停状态下若用户手动滑动过，绝不自动跳转
    if (!playing && userManualOverrideRef.current) return

    // 单步自然推进时（如 activeIndex === prev + 1）平滑滚动；跳跃推进（如快进）直接到位
    const isStepAdvance = prevActiveIndexRef.current >= 0 && activeIndex === prevActiveIndexRef.current + 1
    prevActiveIndexRef.current = activeIndex

    scrollToActiveIndex(activeIndex, { animated: isStepAdvance })
  }, [activeIndex, active, playing, viewportHeight, scrollToActiveIndex])

  const handleRowTap = useCallback(
    (index: number, lineAtMs: number) => {
      clearIdleResumeTimer()
      isInteractingRef.current = false
      userManualOverrideRef.current = false
      onSeek((lineAtMs + offsetMs) / 1000)
      scrollToActiveIndex(index, { animated: true, forceCenter: true })
    },
    [offsetMs, onSeek, clearIdleResumeTimer, scrollToActiveIndex],
  )

  const handleRowLongPress = useCallback((index: number) => {
    setSheetOpenFor(index)
  }, [])

  const handleRowLayout = useCallback(
    (index: number, y: number) => {
      offsets.current[index] = y
      trackOffsetsCache.set(trackId, offsets.current)

      // 如果当前正在播放的行初次完成排版，且视口高度已就绪，立即无动画直达定位
      if (!hasPositionedForCurrentTrackRef.current && index === activeIndex && viewportHeight > 0) {
        hasPositionedForCurrentTrackRef.current = true
        scrollToActiveIndex(activeIndex, { animated: false, forceCenter: true })
      }
    },
    [trackId, activeIndex, viewportHeight, scrollToActiveIndex],
  )

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
      if (!isDismissing.value) {
        const isTop = event.contentOffset.y <= 2
        if (isTop !== isAtTopRef.value) {
          isAtTopRef.value = isTop
          if (onTopStateChange) {
            runOnJS(onTopStateChange)(isTop)
          }
        }
      }

      // 仅当手势是在歌词最顶部（已吸顶）发起时，才联动全屏模态框下移
      // 若在歌词下方内容区向下拉，播放器页面不动，专心执行歌词列表内部滚动与到顶回弹
      if (translateY && !isDismissing.value && dragStartedAtTopRef.value) {
        if (event.contentOffset.y < 0) {
          translateY.value = -event.contentOffset.y
        } else if (translateY.value > 0) {
          translateY.value = 0
        }
      }
    },
    onBeginDrag: (event) => {
      isDismissing.value = false
      // 记录手势起点：只有在最顶部（offset <= 1）开始拉动才算全屏下拉退场手势
      dragStartedAtTopRef.value = event.contentOffset.y <= 1
    },
    onEndDrag: (event) => {
      // 若非顶部发起的手势，绝不触发退场，确保歌词列表自然回弹吸顶
      if (!translateY || isDismissing.value || !dragStartedAtTopRef.value) {
        return
      }

      const pullDistance = -event.contentOffset.y
      if (pullDistance > 0) {
        const exitTargetY = (screenHeight || 850) + 100
        // 将 iOS UIScrollView 速度（pt/ms，向下拉为负）转换为 pt/s，完全对齐播放页 PanGesture 的 velocityY
        const downwardVelocity = -(event.velocity?.y ?? 0) * 1000
        // 动量投射：结合当前位移与松手瞬时速度（与播放页完全一致的 Apple 物理法则）
        const projectedY = pullDistance + downwardVelocity * 0.15
        const dismissThreshold = 150
        const shouldDismiss =
          (projectedY > dismissThreshold && pullDistance > 60) ||
          (pullDistance > 180)

        if (shouldDismiss && downwardVelocity > -200) {
          isDismissing.value = true
          translateY.value = withTiming(
            exitTargetY,
            {
              duration: 450,
              easing: Easing.bezier(0.25, 1, 0.5, 1),
            },
            (finished) => {
              if (finished) {
                if (onDismiss) {
                  runOnJS(onDismiss)()
                }
              } else {
                isDismissing.value = false
              }
            }
          )
        } else {
          // 未达退场阈值：与播放页完全一致的 420ms 贝塞尔弹性回弹曲线
          translateY.value = withTiming(0, {
            duration: 420,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
          })
        }
      }
    },
    onMomentumEnd: () => {
      if (translateY && !isDismissing.value && translateY.value > 0) {
        translateY.value = withTiming(0, { duration: 200 })
      }
    },
  })

  const contentAnimatedStyle = useAnimatedStyle(() => {
    // 仅当手势是在歌词最顶部发起全屏下拉退场时，反向补偿歌词行 translateY，
    // 抵消 iOS UIScrollView 原生橡皮筋内部下移，让歌词在模态框内纹丝不动，作为一整块刚体同步下滑；
    // 而若手势是从歌词下方向上滑到顶部（dragStartedAtTopRef 为 false），不进行补偿，保留自然原生的到顶回弹动画。
    if (dragStartedAtTopRef.value && scrollY.value < 0) {
      return {
        transform: [{ translateY: scrollY.value }],
      }
    }
    return {
      transform: [{ translateY: 0 }],
    }
  })

  if (query.isPending) {
    return (
      <View style={[styles.center, bottomSpace ? { paddingBottom: bottomSpace } : null]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  if (query.isError) {
    return (
      <View style={[{ flex: 1 }, bottomSpace ? { paddingBottom: bottomSpace } : null]}>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </View>
    )
  }

  if (lines.length === 0) {
    return (
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.center, bottomSpace ? { paddingBottom: bottomSpace } : null, { flex: 1 }]}
        bounces={true}
        alwaysBounceVertical={true}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        <Animated.View style={contentAnimatedStyle}>
          <Text style={styles.empty}>暂无歌词</Text>
        </Animated.View>
      </Animated.ScrollView>
    )
  }

  return (
    <View style={styles.wrapper}>
      <Animated.ScrollView
        ref={scrollRef as any}
        style={styles.scroll}
        contentContainerStyle={[styles.content, bottomSpace ? { paddingBottom: bottomSpace + 24 } : null]}
        contentOffset={{ x: 0, y: initialScrollY }}
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={true}
        onLayout={(event) => {
          const h = event.nativeEvent.layout.height
          if (h > 0) {
            lastKnownViewportHeight = h
            setViewportHeight(h)
          }
        }}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        onScrollBeginDrag={() => {
          currentScrollY.current = scrollY.value
          isInteractingRef.current = true
          userManualOverrideRef.current = true
          setPressingRowIndex(null)
          clearIdleResumeTimer()
          onScrollBeginDrag?.()
        }}
        onScrollEndDrag={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          currentScrollY.current = event.nativeEvent.contentOffset.y
          const { velocity } = event.nativeEvent
          // 若松手时无明显惯性滑行（静止松手或慢速松手），立即结束物理交互并开启 3.5s 阅读保护（暂停时除外）
          if (!velocity || Math.abs(velocity.y) < 0.05) {
            isInteractingRef.current = false
            if (playing) {
              startIdleResumeTimer()
            }
          }
        }}
        onMomentumScrollBegin={() => {
          isInteractingRef.current = true
          clearIdleResumeTimer()
        }}
        onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          currentScrollY.current = event.nativeEvent.contentOffset.y
          isInteractingRef.current = false
          if (playing) {
            startIdleResumeTimer()
          }
        }}
      >
        <Animated.View style={[styles.contentWrapper, contentAnimatedStyle]}>
          {lines.map((line, index) => (
            <LyricRow
              key={`${line.atMs}-${index}`}
              line={line}
              active={index === activeIndex}
              selected={index === pressingRowIndex}
              litCount={index === activeIndex ? litCount : undefined}
              synced={synced}
              onTap={() => handleRowTap(index, line.atMs)}
              onLongPress={() => handleRowLongPress(index)}
              onPressIn={() => setPressingRowIndex(index)}
              onPressOut={() => setPressingRowIndex((prev) => (prev === index ? null : prev))}
              onLayout={(y) => handleRowLayout(index, y)}
            />
          ))}
        </Animated.View>
      </Animated.ScrollView>

      {sheetOpenFor !== null ? (
        <LyricsSheetModal
          title={songTitle ?? ''}
          lines={lines}
          initialIndex={sheetOpenFor}
          onClose={() => setSheetOpenFor(null)}
        />
      ) : null}
    </View>
  )
}

interface LyricRowProps {
  line: LyricLine
  /** 正在唱的这一句 */
  active: boolean
  /** 正在被点击/选中的这一句 */
  selected?: boolean
  /**
   * 当前唱到第几个字：
   * 卡拉OK行（文件带逐词时间）给数字 → 逐字点亮；
   * 其余给 undefined → 整行高亮（信息行 / 没有逐词数据的普通 LRC）。
   */
  litCount?: number
  synced: boolean
  onTap: () => void
  onLongPress: () => void
  onPressIn?: () => void
  onPressOut?: () => void
  onLayout: (y: number) => void
}

const LyricRow = memo(function LyricRow({
  line,
  active,
  selected = false,
  litCount,
  synced,
  onTap,
  onLongPress,
  onPressIn,
  onPressOut,
  onLayout,
}: LyricRowProps) {
  const karaoke = active && litCount !== undefined
  const chars = karaoke && line.text ? Array.from(line.text) : []
  const sung = Math.min(Math.max(litCount ?? 0, 0), chars.length)

  const handlePress = useCallback(() => {
    void Haptics.selectionAsync()
    onTap()
  }, [onTap])

  const handleLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onLongPress()
  }, [onLongPress])

  return (
    <Pressable
      onPress={synced ? handlePress : undefined}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLongPress={handleLongPress}
      delayLongPress={LONG_PRESS_MS}
      onLayout={(event) => onLayout(event.nativeEvent.layout.y)}
      accessibilityRole={synced ? 'button' : 'text'}
      accessibilityLabel={`${line.text}${active ? '（正在播放）' : ''}${synced ? '，点按从这句开始播放，长按查看全部歌词' : ''}`}
      style={[
        styles.rowContainer,
        selected && styles.rowSelected,
      ]}
    >
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
                <Text key={index} style={index < sung ? styles.charSung : styles.charPending}>
                  {char}
                </Text>
              ))
            : line.text}
        </Text>
      ) : (
        // 前奏 / 间奏这类空行用声波图标占位，不用音符字符
        <Icon name="playing" size={iconSize.lg} color={active ? colors.playing : colors.iconDim} />
      )}
      {line.translation ? (
        <Text style={[styles.translation, (active || selected) && styles.translationActive]}>
          {line.translation}
        </Text>
      ) : null}
    </Pressable>
  )
})

/** 长按某一句后弹的「全部歌词」面板：滚到那一句并高亮，可复制 / 分享 */
function LyricsSheetModal({
  title,
  lines,
  initialIndex,
  onClose,
}: {
  title: string
  lines: LyricLine[]
  initialIndex: number
  onClose: () => void
}) {
  const scrollRef = useRef<ScrollView>(null)
  const rowY = useRef<number[]>([])
  const [viewH, setViewH] = useState(0)
  const safe = Math.min(Math.max(initialIndex, 0), lines.length - 1)

  // 打开后把长按的那一句滚到面板中间
  useEffect(() => {
    if (viewH <= 0) return
    const timer = setTimeout(() => {
      const y = rowY.current[safe]
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - viewH / 2, 0), animated: false })
    }, 60)
    return () => clearTimeout(timer)
  }, [safe, viewH])

  const allText = useMemo(
    () =>
      lines
        .map((line) => line.text)
        .filter((text): text is string => Boolean(text))
        .join('\n'),
    [lines],
  )

  const copyAll = useCallback(() => {
    void Clipboard.setStringAsync(allText)
  }, [allText])

  const shareAll = useCallback(() => {
    void Share.share({ message: title ? `${title}\n\n${allText}` : allText })
  }, [allText, title])

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetScrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="关闭全部歌词"
        />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {title || '全部歌词'}
            </Text>
            <IconButton name="close" size={iconSize.lg} color={colors.iconMid} onPress={onClose} accessibilityLabel="关闭" />
          </View>

          <ScrollView
            ref={scrollRef}
            onLayout={(event) => setViewH(event.nativeEvent.layout.height)}
            contentContainerStyle={styles.sheetList}
            showsVerticalScrollIndicator={false}
          >
            {lines.map((line, index) =>
              line.text ? (
                <View
                  key={`${line.atMs}-${index}`}
                  onLayout={(event) => {
                    rowY.current[index] = event.nativeEvent.layout.y
                  }}
                >
                  <Text style={[styles.sheetLine, index === safe && styles.sheetLineSelected]}>{line.text}</Text>
                  {line.translation ? <Text style={styles.sheetTranslation}>{line.translation}</Text> : null}
                </View>
              ) : null,
            )}
          </ScrollView>

          <View style={styles.sheetActions}>
            <Pressable
              style={({ pressed }) => [styles.sheetButton, pressed && styles.sheetButtonPressed]}
              onPress={copyAll}
              accessibilityRole="button"
              accessibilityLabel="复制全部歌词"
            >
              <Icon name="copy" size={iconSize.md} color={colors.textPrimary} />
              <Text style={styles.sheetButtonLabel}>复制全部歌词</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sheetButton, pressed && styles.sheetButtonPressed]}
              onPress={shareAll}
              accessibilityRole="button"
              accessibilityLabel="分享全部歌词"
            >
              <Icon name="share" size={iconSize.md} color={colors.textPrimary} />
              <Text style={styles.sheetButtonLabel}>分享</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingTop: spacing.sm,
    paddingBottom: 240,
    gap: spacing.sm,
    alignItems: 'stretch',
    width: '100%',
  },
  contentWrapper: {
    width: '100%',
    alignSelf: 'stretch',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.subhead, color: colors.textTertiary },

  // —— 歌词行容器与选中浅色矩形板 ——
  rowContainer: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },

  // —— 歌词文字：去掉模糊，通过字号与纯度拉大对比度 ——
  line: {
    fontSize: 21,
    lineHeight: 32,
    fontFamily: fonts.bold,
    color: 'rgba(255, 255, 255, 0.40)',
  },
  // 正在唱的整行：字号显著增大（28pt），纯白高亮，拉开强烈视觉对比
  lineActive: {
    fontSize: 28,
    lineHeight: 40,
    color: colors.textPrimary,
  },
  // 卡拉OK当前行：放大到 30pt，唱到的字逐字纯白
  lineKaraoke: {
    fontSize: 30,
    lineHeight: 42,
    color: colors.textPrimary,
  },
  // 选中的那一行（点击/长按反馈）：变纯白清晰
  lineSelected: {
    color: colors.textPrimary,
  },
  charSung: { color: colors.textPrimary },
  charPending: { color: PENDING_CHAR },

  // —— 翻译 ——
  translation: {
    ...typography.subhead,
    marginTop: spacing.xs,
    color: 'rgba(255, 255, 255, 0.28)',
  },
  translationActive: { color: colors.textSecondary },
  // —— 全部歌词面板 ——
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.xl },
  sheetCard: { backgroundColor: '#1c1c21f2', borderRadius: radius.xl, maxHeight: '78%', overflow: 'hidden' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  sheetTitle: { ...typography.callout, color: colors.textPrimary, flex: 1, paddingRight: spacing.sm },
  sheetList: { paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.md },
  sheetLine: { ...typography.body, color: colors.textTertiary, lineHeight: 26 },
  sheetLineSelected: {
    color: colors.textPrimary,
    fontWeight: '700',
    backgroundColor: colors.bgButtonSecondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  sheetTranslation: { ...typography.footnote, color: colors.textQuaternary, marginTop: spacing.xs },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  sheetButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgButtonSecondary,
  },
  sheetButtonPressed: { backgroundColor: colors.bgCardHover },
  sheetButtonLabel: { ...typography.callout, color: colors.textPrimary },
})
