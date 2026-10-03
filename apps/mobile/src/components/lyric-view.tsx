/* eslint-disable react-hooks/immutability */
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
} from 'react-native'
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsPlaying } from 'react-native-track-player'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient } from 'expo-linear-gradient'
import type { LyricLine } from '@qj/core-domain'
import { ErrorState } from '@/components/list-states'
import { Icon, iconSize, IconButton } from '@/components/icon'
import { useLyricSheet } from '@/lib/lyric-offset'
import { usePlayerStore } from '@/player/store'
import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

/** 没有下一行时，假设当前行唱这么久（逐词进度的兜底） */
const FALLBACK_LINE_MS = 4000
const EMPTY_LINES: LyricLine[] = []
/** 长按多久进入歌词分享 */
const LONG_PRESS_MS = 320
const LYRIC_MOTION = { focusMs: 180, wordMs: 100, readIdleMs: 3500, restingScale: 0.96 } as const

/** 跨组件与切页持久缓存的行坐标与视口高度，避免切回歌词页重新排版导致的滚动跳跃 */
const trackOffsetsCache = new Map<string, number[]>()
let lastKnownViewportHeight = 0

interface LyricViewProps {
  trackId: string
  /** 当前播放进度（毫秒） */
  positionMs: number
  /** 当前曲目对应的歌词偏移，避免切歌首帧沿用上一首 */
  offsetMs?: number
  /** 点了某一行：跳到那一句开始播（播放与否由调用方决定） */
  onSeek: (seconds: number) => void
  /** 分享面板显示的歌名（分享文本里也要用） */
  songTitle?: string
  songArtist?: string
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
    const lineAtMs = lines[i]?.atMs ?? 0
    if (lineAtMs < 0) continue // 标题/歌手等元数据没有演唱时间，不参与高亮
    if (lineAtMs <= atMs) index = i
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
function litProgressChars(line: LyricLine, atMs: number, nextLineAtMs: number): number {
  const words = line.words ?? []
  if (words.length === 0) return 0
  let progress = 0
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!
    const wordChars = Array.from(word.text)
    const spanStart = word.atMs
    const spanEnd = words[i + 1]?.atMs ?? nextLineAtMs
    const span = Math.max(spanEnd - spanStart, 1)
    for (let c = 0; c < wordChars.length; c += 1) {
      const charStart = spanStart + (span * c) / wordChars.length
      const charEnd = spanStart + (span * (c + 1)) / wordChars.length
      if (atMs >= charEnd) progress += 1
      else if (atMs > charStart) progress += (atMs - charStart) / Math.max(charEnd - charStart, 1)
    }
  }
  return progress
}

export function LyricView({
  trackId,
  positionMs,
  offsetMs: offsetProp,
  onSeek,
  songTitle,
  songArtist,
  bottomSpace,
  onTopStateChange,
  onPullTop,
  onScrollBeginDrag,
  active = true,
  translateY,
  onDismiss,
  playing: playingProp,
}: LyricViewProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const hookPlaying = useIsPlaying()
  const playing = playingProp !== undefined ? playingProp : Boolean(hookPlaying?.playing)
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const storedOffsetMs = usePlayerStore((state) => state.lyricOffsetTrackId === trackId ? state.lyricOffsetMs : 0)
  const offsetMs = offsetProp ?? storedOffsetMs
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const offsets = useRef<number[]>(trackOffsetsCache.get(trackId) ?? [])
  const [viewportHeight, setViewportHeight] = useState(lastKnownViewportHeight)
  /** 用户手指按压下的行（按下显示圆角矩形板，手指离开后立即消失） */
  const [pressingRowIndex, setPressingRowIndex] = useState<number | null>(null)
  /** 长按某一行 → 进入分享面板并默认选中该句 */
  const [sheetOpenFor, setSheetOpenFor] = useState<number | null>(null)

  const query = useLyricSheet(trackId)
  const sheet = query.data ?? null
  const lines = sheet?.lines ?? EMPTY_LINES
  const synced = sheet?.synced ?? false

  const atMs = positionMs + offsetMs
  const activeIndex = useMemo(() => (synced ? activeIndexOf(lines, atMs) : -1), [lines, atMs, synced])

  // contentOffset 是原生可写属性，随 activeIndex 更新会直接跳位，抢先打断 scrollTo 动画。
  // 只在挂载时读取一次缓存；后续定位全部经 scrollToActiveIndex，遵守交互锁。
  const [initialContentOffset] = useState(() => {
    const cached = trackOffsetsCache.get(trackId)
    const vh = lastKnownViewportHeight || 500
    const effectiveH = Math.max(vh - (bottomSpace ?? 0), 120)
    const y = activeIndex >= 0 && cached?.[activeIndex] !== undefined
      ? Math.max(cached[activeIndex]! - effectiveH * 0.38, 0)
      : 0
    return { x: 0, y }
  })

  const scrollY = useSharedValue(initialContentOffset.y)
  const isAtTopRef = useSharedValue(true)
  const isDismissing = useSharedValue(false)
  const dragStartedAtTopRef = useSharedValue(false)

  // 当前行是卡拉OK行时，唱到第几个字（整行高亮的行用不上）
  const activeKaraoke = activeIndex >= 0 && synced && isKaraokeLine(lines[activeIndex]!)
  const litProgress = useMemo(() => {
    if (!activeKaraoke || activeIndex < 0) return undefined
    const nextAt = lines[activeIndex + 1]?.atMs ?? (lines[activeIndex]?.atMs ?? 0) + FALLBACK_LINE_MS
    return litProgressChars(lines[activeIndex]!, atMs, nextAt)
  }, [activeKaraoke, activeIndex, atMs, lines])

  // —— 手势防冲突与视口跟随 ——
  const isInteractingRef = useRef(false)
  const isPressingRowRef = useRef(false)
  const isReadingSheetRef = useRef(false)
  const userManualOverrideRef = useRef(false)
  const idleResumeTimer = useRef<NodeJS.Timeout | null>(null)
  const prevActiveRef = useRef(active)
  const skipFollowAfterActivationRef = useRef(false)
  const hasPositionedForCurrentTrackRef = useRef(false)
  const lastLinesRef = useRef(lines)

  // 歌词源变更时旧行高不再可信；同一曲目重新进入且歌词未变时保留坐标缓存。
  useEffect(() => {
    if (lastLinesRef.current === lines) return
    lastLinesRef.current = lines
    offsets.current = []
    trackOffsetsCache.delete(trackId)
    hasPositionedForCurrentTrackRef.current = false
  }, [lines, trackId])

  const clearIdleResumeTimer = useCallback(() => {
    if (idleResumeTimer.current) {
      clearTimeout(idleResumeTimer.current)
      idleResumeTimer.current = null
    }
  }, [])

  // 切歌时重置手势与位移状态
  useEffect(() => {
    offsets.current = trackOffsetsCache.get(trackId) ?? []
    isInteractingRef.current = false
    isPressingRowRef.current = false
    isReadingSheetRef.current = false
    userManualOverrideRef.current = false
    clearIdleResumeTimer()
    hasPositionedForCurrentTrackRef.current = false
  }, [trackId, clearIdleResumeTimer])

  useEffect(() => {
    return clearIdleResumeTimer
  }, [clearIdleResumeTimer])

  const scrollToActiveIndex = useCallback(
    (index: number, options?: { animated?: boolean; forceCenter?: boolean }) => {
      const animated = (options?.animated ?? true) && !reduceMotion
      const forceCenter = options?.forceCenter ?? false
      if (!synced || index < 0 || viewportHeight <= 0) return
      const targetY = offsets.current[index]
      if (targetY === undefined) return

      const effectiveHeight = Math.max(viewportHeight - (bottomSpace ?? 0), 120)

      // 1. 手指按住、拖拽或惯性滑动中：硬锁定，绝对不自动滚动视口
      if (isInteractingRef.current) return
      if (isPressingRowRef.current || isReadingSheetRef.current) return

      // 整个阅读保护期都由用户掌握视口，当前行离屏也不能提前抢回。
      if (userManualOverrideRef.current && !forceCenter) return

      // 正常自动跟随：定位到屏幕中上部（约 40% 视口高）。
      const targetScroll = Math.max(targetY - effectiveHeight * 0.38, 0)

      if (animated) {
        scrollRef.current?.scrollTo({ y: targetScroll, animated: true })
      } else {
        scrollRef.current?.scrollTo({ y: targetScroll, animated: false })
      }
    },
    [synced, viewportHeight, bottomSpace, reduceMotion, scrollRef],
  )

  // 计时器到期时跟随最新歌词，避免闭包还指向用户松手时的旧行。
  const latestFollow = useRef({ activeIndex, active, playing, scrollToActiveIndex })
  useEffect(() => {
    latestFollow.current = { activeIndex, active, playing, scrollToActiveIndex }
  }, [activeIndex, active, playing, scrollToActiveIndex])

  const startIdleResumeTimer = useCallback(() => {
    clearIdleResumeTimer()
    if (!playing) return
    idleResumeTimer.current = setTimeout(() => {
      idleResumeTimer.current = null
      const latest = latestFollow.current
      if (!latest.active || !latest.playing || isInteractingRef.current || isPressingRowRef.current || isReadingSheetRef.current) return
      userManualOverrideRef.current = false
      if (latest.activeIndex >= 0) {
        latest.scrollToActiveIndex(latest.activeIndex, { animated: true, forceCenter: true })
      }
    }, LYRIC_MOTION.readIdleMs)
  }, [clearIdleResumeTimer, playing])

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
      skipFollowAfterActivationRef.current = true
      if (activeIndex >= 0 && viewportHeight > 0) {
        scrollToActiveIndex(activeIndex, { animated: false, forceCenter: true })
      }
    }
  }, [active, activeIndex, viewportHeight, scrollToActiveIndex])

  // 高亮行自然推进或首帧就绪时的滚动判定
  useEffect(() => {
    if (skipFollowAfterActivationRef.current) {
      skipFollowAfterActivationRef.current = false
      return
    }
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

    // 首次定位之外都使用可被手指打断的原生滚动，倒退/跨行跳转也不瞬移。
    scrollToActiveIndex(activeIndex, { animated: true })
  }, [activeIndex, active, playing, viewportHeight, scrollToActiveIndex])

  const handleRowTap = useCallback(
    (index: number, lineAtMs: number) => {
      clearIdleResumeTimer()
      isInteractingRef.current = false
      isPressingRowRef.current = false
      userManualOverrideRef.current = false
      onSeek(Math.max(0, (lineAtMs - offsetMs) / 1000))
      scrollToActiveIndex(index, { animated: true, forceCenter: true })
    },
    [offsetMs, onSeek, clearIdleResumeTimer, scrollToActiveIndex],
  )

  const handleRowLongPress = useCallback((index: number) => {
    clearIdleResumeTimer()
    isPressingRowRef.current = false
    setPressingRowIndex(null)
    isReadingSheetRef.current = true
    setSheetOpenFor(index)
  }, [clearIdleResumeTimer])

  const closeLyricsSheet = useCallback(() => {
    isReadingSheetRef.current = false
    userManualOverrideRef.current = true
    setSheetOpenFor(null)
    // 关闭阅读面板后也保留一段阅读时间，不立刻把背后的歌词拉走。
    startIdleResumeTimer()
  }, [startIdleResumeTimer])

  const handleRowLayout = useCallback(
    (index: number, y: number) => {
      offsets.current[index] = y
      trackOffsetsCache.set(trackId, offsets.current)

      // 如果当前正在播放的行初次完成排版，且视口高度已就绪，立即无动画直达定位
      const latest = latestFollow.current
      if (!hasPositionedForCurrentTrackRef.current && index === latest.activeIndex && viewportHeight > 0) {
        hasPositionedForCurrentTrackRef.current = true
        latest.scrollToActiveIndex(index, { animated: false, forceCenter: true })
      }
    },
    [trackId, viewportHeight],
  )

  const handleRowPressIn = useCallback((index: number) => {
    isPressingRowRef.current = true
    clearIdleResumeTimer()
    setPressingRowIndex(index)
  }, [clearIdleResumeTimer])
  const handleRowPressOut = useCallback((index: number) => {
    isPressingRowRef.current = false
    setPressingRowIndex((prev) => (prev === index ? null : prev))
    if (!isInteractingRef.current && !isReadingSheetRef.current) startIdleResumeTimer()
  }, [startIdleResumeTimer])

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
        const dismissThreshold = 130
        const shouldDismiss =
          (projectedY > dismissThreshold && pullDistance > 40) ||
          (pullDistance > 100)

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
        <ActivityIndicator color={colors.loadingIndicator} />
      </View>
    )
  }

  if (query.isError && !sheet) {
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
      {!synced ? <Text style={styles.unsyncedHint}>当前歌词不支持逐句同步</Text> : null}
      <MaskedView
        style={styles.maskContainer}
        maskElement={
          <LinearGradient
            colors={[
              'rgba(0,0,0,0)',
              'rgba(0,0,0,1)',
              'rgba(0,0,0,1)',
              'rgba(0,0,0,0)',
            ]}
            locations={[0, 0.08, 0.82, 0.94]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        }
      >
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.content, bottomSpace ? { paddingBottom: bottomSpace + 24 } : null]}
          contentOffset={initialContentOffset}
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
            isInteractingRef.current = true
            userManualOverrideRef.current = true
            isPressingRowRef.current = false
            setPressingRowIndex(null)
            clearIdleResumeTimer()
            onScrollBeginDrag?.()
          }}
          onScrollEndDrag={() => {
            // 边缘快速松手可能没有惯性回调；先结束拖拽，若产生惯性则由 onMomentumScrollBegin 重新锁定。
            isInteractingRef.current = false
            startIdleResumeTimer()
          }}
          onMomentumScrollBegin={() => {
            isInteractingRef.current = true
            clearIdleResumeTimer()
          }}
          onMomentumScrollEnd={() => {
            isInteractingRef.current = false
            if (playing) {
              startIdleResumeTimer()
            }
          }}
        >
          <Animated.View style={[styles.contentWrapper, contentAnimatedStyle]}>
            {lines.map((line, index) => (
              <LyricRow
                key={`${trackId}-${line.atMs}-${index}`}
                index={index}
                line={line}
                active={index === activeIndex}
                viewActive={active}
                selected={index === pressingRowIndex}
                litProgress={index === activeIndex ? litProgress : undefined}
                synced={synced}
                renderKaraoke={isKaraokeLine(line) && Math.abs(index - Math.max(activeIndex, 0)) <= 1}
                onTap={handleRowTap}
                onLongPress={handleRowLongPress}
                onPressIn={handleRowPressIn}
                onPressOut={handleRowPressOut}
                onLayout={handleRowLayout}
              />
            ))}
          </Animated.View>
        </Animated.ScrollView>
      </MaskedView>

      {sheetOpenFor !== null ? (
        <LyricsSheetModal
          title={songTitle ?? ''}
          artist={songArtist}
          lines={lines}
          initialIndex={sheetOpenFor}
          onClose={closeLyricsSheet}
        />
      ) : null}
    </View>
  )
}

interface LyricRowProps {
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
  onLayout: (index: number, y: number) => void
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

const LyricRow = memo(function LyricRow({
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
  const metadata = line.atMs < 0
  const seekable = synced && !metadata
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

  const focused = !metadata && synced && active
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
      opacity: metadata ? 0.65 : selected ? 1.0 : !synced ? 0.68 : opacity,
      transform: [{ scale: metadata || !synced ? 1 : scale }],
    }
  })

  const animatedTranslationStyle = useAnimatedStyle(() => ({
    color: selected ? colors.textPrimary : interpolateColor(
      activeAnim.value, [0, 1], [colors.textSecondary, colors.textPrimary],
    ),
  }))

  const handlePress = useCallback(() => {
    void Haptics.selectionAsync()
    onTap(index, line.atMs)
  }, [onTap, index, line.atMs])

  const handleLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onLongPress(index)
  }, [onLongPress, index])

  return (
    <Pressable
      onPress={seekable ? handlePress : undefined}
      onPressIn={() => onPressIn(index)}
      onPressOut={() => onPressOut(index)}
      onLongPress={handleLongPress}
      delayLongPress={LONG_PRESS_MS}
      onLayout={(event) => onLayout(index, event.nativeEvent.layout.y)}
      accessibilityRole={seekable ? 'button' : 'text'}
      accessibilityActions={[{ name: 'showLyrics', label: '选择分享歌词' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'showLyrics') handleLongPress()
      }}
      accessibilityLabel={`${line.text}${active ? '（正在播放）' : ''}${seekable ? '，点按从这句开始播放，长按选择分享歌词' : '，长按选择分享歌词'}`}
      style={[
        styles.rowContainer,
        metadata && styles.metadataRow,
        selected && styles.rowSelected,
      ]}
    >
      <Animated.View style={[styles.rowInner, animatedContentStyle]}>
        {line.text ? (
          <Text
            style={[
              styles.line,
              metadata && styles.metadataLine,
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

/** 长按默认选中该句；选择顺序始终按歌词原顺序导出。 */
function LyricsSheetModal({ title, artist, lines, initialIndex, onClose }: {
  title: string
  artist?: string
  lines: LyricLine[]
  initialIndex: number
  onClose: () => void
}) {
  const colors = useThemeColors()
  const styles = useStyles()
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState<Set<number>>(() => new Set([initialIndex]))
  const [copyLabel, setCopyLabel] = useState('复制')
  const [shareError, setShareError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const scrollRef = useRef<ScrollView>(null)
  const rowY = useRef<number[]>([])
  const [viewH, setViewH] = useState(0)
  const available = useMemo(() => lines.flatMap((line, index) => line.text?.trim() ? [index] : []), [lines])
  const selectedLines = available.filter((index) => selected.has(index))
  const allSelected = selectedLines.length === available.length
  const selectedText = selectedLines.map((index) => lines[index]!.text).join('\n')

  useEffect(() => {
    if (viewH <= 0) return
    const timer = setTimeout(() => {
      const y = rowY.current[initialIndex]
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - viewH / 3, 0), animated: false })
    }, 60)
    return () => clearTimeout(timer)
  }, [initialIndex, viewH])

  const changeSelection = (next: Set<number>) => {
    if (busyRef.current) return
    setSelected(next)
    setCopyLabel('复制')
    setShareError(null)
  }
  const toggleLine = (index: number) => {
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    changeSelection(next)
  }
  const perform = async (action: 'copy' | 'share') => {
    if (!selectedText || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setShareError(null)
    try {
      if (action === 'copy') {
        await Clipboard.setStringAsync(selectedText)
        setCopyLabel('已复制')
      } else {
        const identity = [title, artist].filter(Boolean).join(' · ')
        await Share.share({ message: [selectedText, identity].filter(Boolean).join('\n\n') })
      }
    } catch {
      if (action === 'copy') setCopyLabel('复制失败，重试')
      else setShareError('分享未完成，请重试')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <Modal visible presentationStyle="pageSheet" allowSwipeDismissal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} accessibilityViewIsModal>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>分享歌词</Text>
          <IconButton name="close" size={iconSize.lg} color={colors.iconMid} onPress={onClose} accessibilityLabel="关闭歌词分享" />
        </View>
        <View style={styles.sheetIdentity}>
          <Text style={styles.sheetSong} numberOfLines={2}>{title || '当前歌曲'}</Text>
          {artist ? <Text style={styles.sheetArtist} numberOfLines={1}>{artist}</Text> : null}
        </View>
        <View style={styles.sheetSelectionBar}>
          <Text style={styles.sheetHint}>点选想分享的歌词</Text>
          <Pressable onPress={() => changeSelection(new Set(allSelected ? [] : available))} disabled={busy} accessibilityRole="button" accessibilityLabel={allSelected ? '取消全选' : '全选歌词'} style={styles.sheetSelectAll}>
            <Text style={styles.sheetSelectAllLabel}>{allSelected ? '取消全选' : '全选'}</Text>
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} style={styles.sheetScroll} onLayout={(event) => setViewH(event.nativeEvent.layout.height)} contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
          {available.map((index) => {
            const line = lines[index]!
            const checked = selected.has(index)
            return (
              <Pressable key={`${line.atMs}-${index}`} onLayout={(event) => { rowY.current[index] = event.nativeEvent.layout.y }} onPress={() => toggleLine(index)} disabled={busy} accessibilityRole="checkbox" accessibilityLabel={line.text} accessibilityState={{ checked, disabled: busy }} style={({ pressed }) => [styles.sheetRow, checked && styles.sheetRowSelected, pressed && styles.sheetButtonPressed]}>
                <View style={styles.sheetRowText}>
                  <Text style={[styles.sheetLine, checked && styles.sheetLineSelected]}>{line.text}</Text>
                  {line.translation ? <Text style={styles.sheetTranslation}>{line.translation}</Text> : null}
                </View>
              </Pressable>
            )
          })}
        </ScrollView>
        <View style={styles.sheetFooter}>
          <Text style={styles.sheetCount} accessibilityLiveRegion="polite">{selectedLines.length ? `已选 ${selectedLines.length} 句` : '请选择歌词'}</Text>
          <View style={styles.sheetActions}>
            <Pressable style={({ pressed }) => [styles.sheetButton, pressed && styles.sheetButtonPressed, (!selectedText || busy) && styles.sheetButtonDisabled]} onPress={() => void perform('copy')} disabled={!selectedText || busy} accessibilityRole="button" accessibilityLabel={copyLabel === '复制' ? '复制所选歌词' : copyLabel} accessibilityState={{ disabled: !selectedText || busy, busy }}>
              <Icon name="copy" size={iconSize.md} color={colors.textPrimary} />
              <Text style={styles.sheetButtonLabel} accessibilityLiveRegion="polite">{copyLabel}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.sheetButton, styles.sheetShareButton, pressed && styles.sheetButtonPressed, (!selectedText || busy) && styles.sheetButtonDisabled]} onPress={() => void perform('share')} disabled={!selectedText || busy} accessibilityRole="button" accessibilityLabel="分享所选歌词" accessibilityState={{ disabled: !selectedText || busy, busy }}>
              <Icon name="share" size={iconSize.md} color={colors.textOnAccent} />
              <Text style={[styles.sheetButtonLabel, styles.sheetShareLabel]}>分享</Text>
            </Pressable>
          </View>
          {shareError ? <Text style={styles.sheetFeedback} accessibilityRole="alert">{shareError}</Text> : null}
        </View>
      </View>
    </Modal>
  )
}

const useStyles = createThemedStyles((colors) => ({
  sheetFeedback: { ...typography.footnote, color: colors.textSecondary, textAlign: 'center', paddingBottom: spacing.md },
  wrapper: { flex: 1 },
  unsyncedHint: { ...typography.footnote, color: colors.textSecondary, paddingVertical: spacing.xs },
  maskContainer: { flex: 1 },
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
  metadataRow: { paddingVertical: spacing.xs },
  metadataLine: { ...typography.callout, color: colors.textPrimary },
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
  charSung: { color: colors.textPrimary },
  charPending: { color: colors.textTertiary },

  // —— 翻译 ——
  translation: {
    ...typography.subhead,
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  // —— 歌词选择与分享 ——
  sheetCard: { flex: 1, backgroundColor: colors.bgModal },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.xl, paddingRight: spacing.md, paddingTop: spacing.sm },
  sheetTitle: { ...typography.headline, color: colors.textPrimary },
  sheetIdentity: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  sheetSong: { ...typography.title3, color: colors.textPrimary },
  sheetArtist: { ...typography.subhead, color: colors.textSecondary, marginTop: spacing.xs },
  sheetSelectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  sheetHint: { ...typography.footnote, color: colors.textSecondary },
  sheetSelectAll: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  sheetSelectAllLabel: { ...typography.subhead, color: colors.actionText },
  sheetScroll: { flex: 1 },
  sheetList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  sheetRow: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 48, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md, gap: spacing.md },
  sheetRowSelected: { backgroundColor: colors.bgButtonSecondary },
  sheetRowText: { flex: 1 },
  sheetLine: { ...typography.body, color: colors.textSecondary, lineHeight: 26 },
  sheetLineSelected: { color: colors.textPrimary, fontWeight: '600' },
  sheetTranslation: { ...typography.footnote, color: colors.textSecondary, marginTop: spacing.xs },
  sheetFooter: { paddingTop: spacing.md, paddingHorizontal: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  sheetCount: { ...typography.footnote, color: colors.textSecondary, marginBottom: spacing.sm },
  sheetActions: { flexDirection: 'row', gap: spacing.md },
  sheetButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bgButtonSecondary },
  sheetShareButton: { backgroundColor: colors.primaryAction },
  sheetShareLabel: { color: colors.textOnAccent },
  sheetButtonPressed: { opacity: 0.65 },
  sheetButtonDisabled: { opacity: 0.4 },
  sheetButtonLabel: { ...typography.callout, color: colors.textPrimary },
}))
