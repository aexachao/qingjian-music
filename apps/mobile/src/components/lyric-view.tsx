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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
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

interface LyricViewProps {
  trackId: string
  /** 当前播放进度（毫秒） */
  positionMs: number
  /** 点了某一行：跳到那一句开始播（播放与否由调用方决定） */
  onSeek: (seconds: number) => void
  /** 弹「全部歌词」面板时顶部显示的歌名（分享文本里也要用） */
  songTitle?: string
  /** 底部控制区占位高度（用于空状态提示词居中与歌词底边距） */
  bottomSpace?: number
  /** 底部控制区当前是否可见（用于计算有效净视口高度） */
  controlsVisible?: boolean
  /** 快速向下滑动（快速下甩）唤起控制区 */
  onFastScrollDown?: () => void
  /** 向上滑动歌词时立即隐藏控制区（无需等待 3 秒） */
  onScrollUp?: () => void
  /** 列表是否停在顶部 */
  onTopStateChange?: (atTop: boolean) => void
  /** 列表停在顶部还继续往下拽（overscroll）时触发：播放页用它把周边唤回来 */
  onPullTop?: () => void
  /** 手指开始拖动列表 */
  onScrollBeginDrag?: () => void
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
  controlsVisible = true,
  onFastScrollDown,
  onScrollUp,
  onTopStateChange,
  onPullTop,
  onScrollBeginDrag,
}: LyricViewProps) {
  const offsetMs = usePlayerStore((state) => state.lyricOffsetMs)
  const scrollRef = useRef<ScrollView>(null)
  const offsets = useRef<number[]>([])
  const [viewportHeight, setViewportHeight] = useState(0)
  /** 用户手动点按选中的行（即时提供底板与锐化反馈） */
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  /** 长按某一行 → 弹全部歌词面板，并把那一行滚到可见 */
  const [sheetOpenFor, setSheetOpenFor] = useState<number | null>(null)

  const query = useLyricSheet(trackId)
  const sheet = query.data ?? null
  const lines = sheet?.lines ?? []
  const synced = sheet?.synced ?? false

  const atMs = positionMs + offsetMs
  const activeIndex = useMemo(() => (synced ? activeIndexOf(lines, atMs) : -1), [lines, atMs, synced])

  // 当自然播放推进到下一行时，重置手动选中项
  useEffect(() => {
    setSelectedRowIndex(null)
  }, [activeIndex])

  // 当前行是卡拉OK行时，唱到第几个字（整行高亮的行用不上）
  const activeKaraoke = activeIndex >= 0 && synced && isKaraokeLine(lines[activeIndex]!)
  const litCount = useMemo(() => {
    if (!activeKaraoke || activeIndex < 0) return undefined
    const nextAt = lines[activeIndex + 1]?.atMs ?? (lines[activeIndex]?.atMs ?? 0) + FALLBACK_LINE_MS
    return countLitChars(lines[activeIndex]!, atMs, nextAt)
  }, [activeKaraoke, activeIndex, atMs, lines])

  // —— 手势防冲突与视口容差状态机 ——
  const currentScrollY = useRef(0)
  const isInteractingRef = useRef(false)
  const userManualOverrideRef = useRef(false)
  const idleResumeTimer = useRef<NodeJS.Timeout | null>(null)
  const scrollHistory = useRef<{ y: number; time: number }[]>([])

  const clearIdleResumeTimer = useCallback(() => {
    if (idleResumeTimer.current) {
      clearTimeout(idleResumeTimer.current)
      idleResumeTimer.current = null
    }
  }, [])

  // 切歌时重置手势与位移状态
  useEffect(() => {
    offsets.current = []
    currentScrollY.current = 0
    isInteractingRef.current = false
    userManualOverrideRef.current = false
    clearIdleResumeTimer()
  }, [trackId, clearIdleResumeTimer])

  useEffect(() => {
    return clearIdleResumeTimer
  }, [clearIdleResumeTimer])

  const scrollToActiveIndex = useCallback(
    (index: number, forceCenter = false) => {
      if (!synced || index < 0 || viewportHeight <= 0) return
      const targetY = offsets.current[index]
      if (targetY === undefined) return

      const effectiveHeight =
        controlsVisible && bottomSpace
          ? Math.max(viewportHeight - bottomSpace, 120)
          : viewportHeight

      // 1. 手指按住、拖拽或惯性滑动中：硬锁定，绝对不自动滚动视口
      if (isInteractingRef.current) return

      // 2. 用户松手后的宽容视口态（未超时冷却恢复前）：
      if (userManualOverrideRef.current && !forceCenter) {
        const scrollY = currentScrollY.current
        // 舒适视口安全区：顶部留 40pt，底部留 64pt（避免被控制区羽化蒙版遮挡）
        const safeTop = scrollY + 40
        const safeBottom = scrollY + effectiveHeight - 64

        // 若当前/新高亮行仍在舒适视口内，跳过滚动，仅在原地高亮，不打扰用户视线
        if (targetY >= safeTop && targetY <= safeBottom) {
          return
        }
      }

      // 3. 正常自动跟随或已超出舒适安全区：平滑滚动到上黄金分割位（约 38% 视口高）
      const targetScroll = Math.max(targetY - effectiveHeight * 0.38, 0)
      scrollRef.current?.scrollTo({ y: targetScroll, animated: true })
    },
    [synced, viewportHeight, controlsVisible, bottomSpace],
  )

  const startIdleResumeTimer = useCallback(() => {
    clearIdleResumeTimer()
    idleResumeTimer.current = setTimeout(() => {
      userManualOverrideRef.current = false
      if (activeIndex >= 0) {
        scrollToActiveIndex(activeIndex, false)
      }
    }, 3500)
  }, [clearIdleResumeTimer, activeIndex, scrollToActiveIndex])

  // 高亮行自然推进时的滚动判定
  useEffect(() => {
    scrollToActiveIndex(activeIndex)
  }, [activeIndex, scrollToActiveIndex])

  const lastFastDownTime = useRef(0)

  // 快速下甩实时检测（在滑动中立即响应，零松手延迟，同时屏蔽慢速与按住拖动）
  const checkFastScrollDownRealtime = useCallback(
    (currentY: number, now: number) => {
      if (now - lastFastDownTime.current < 500) return
      const history = scrollHistory.current
      for (let i = 0; i < history.length - 1; i++) {
        const sample = history[i]!
        const dt = now - sample.time
        // 抓取 35ms ~ 90ms 滑动窗口
        if (dt >= 35 && dt <= 90) {
          const dy = currentY - sample.y // 快速下滑：contentOffset.y 减小，dy < 0
          if (dy < -25) {
            const calculatedSpeed = (dy / dt) * 1000 // pt/s
            // 按住慢拖通常只有 -100~-300 pt/s，慢速滑动约 -400~-600 pt/s，快速下滑低于 -800 pt/s
            if (calculatedSpeed <= -800) {
              lastFastDownTime.current = now
              onFastScrollDown?.()
              return
            }
          }
        }
      }
    },
    [onFastScrollDown],
  )

  // 松手（onScrollEndDrag）时的原生物理速度兜底
  const checkFastScrollDownOnDragEnd = useCallback(
    (vy?: number) => {
      if (vy !== undefined && vy <= -0.9) {
        onFastScrollDown?.()
      }
    },
    [onFastScrollDown],
  )

  const handleRowTap = useCallback(
    (index: number, lineAtMs: number) => {
      setSelectedRowIndex(index)
      clearIdleResumeTimer()
      isInteractingRef.current = false
      userManualOverrideRef.current = false
      onSeek((lineAtMs + offsetMs) / 1000)
      scrollToActiveIndex(index, true)
    },
    [offsetMs, onSeek, clearIdleResumeTimer, scrollToActiveIndex],
  )

  const handleRowLongPress = useCallback((index: number) => {
    setSelectedRowIndex(index)
    setSheetOpenFor(index)
  }, [])

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
      <View style={[styles.center, bottomSpace ? { paddingBottom: bottomSpace } : null]}>
        <Text style={styles.empty}>暂无歌词</Text>
      </View>
    )
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, bottomSpace ? { paddingBottom: bottomSpace + 24 } : null]}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          isInteractingRef.current = true
          userManualOverrideRef.current = true
          clearIdleResumeTimer()
          onScrollBeginDrag?.()
        }}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const { contentOffset } = event.nativeEvent
          const now = Date.now()
          const currentY = contentOffset.y
          const lastY = currentScrollY.current
          currentScrollY.current = currentY

          // 1. 上滑立即隐藏逻辑：如果控制区当前处于显示状态，手指上滑歌词立即隐藏控制区
          const instantDy = currentY - lastY
          if (controlsVisible && instantDy > 8 && currentY > 10) {
            onScrollUp?.()
          }

          // 2. 采样历史供快速下滑检测
          scrollHistory.current.push({ y: currentY, time: now })
          const cutoff = now - 120
          scrollHistory.current = scrollHistory.current.filter((item) => item.time >= cutoff)

          // 3. 快速下滑实时检测（零等待，滑行途中立即唤出）
          checkFastScrollDownRealtime(currentY, now)

          const isTop = contentOffset.y <= 4
          onTopStateChange?.(isTop)

          // 顶到头继续往下拽（overscroll 回弹成负偏移）：退出全屏歌词
          if (contentOffset.y < -PULL_REVEAL_PT) {
            onPullTop?.()
          }
        }}
        onScrollEndDrag={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const { velocity } = event.nativeEvent
          checkFastScrollDownOnDragEnd(velocity?.y)

          // 若松手时无明显惯性滑行（静止松手或慢速松手），立即结束物理交互并开启 3.5s 阅读保护
          if (!velocity || Math.abs(velocity.y) < 0.05) {
            isInteractingRef.current = false
            startIdleResumeTimer()
          }
        }}
        onMomentumScrollBegin={() => {
          isInteractingRef.current = true
          clearIdleResumeTimer()
        }}
        onMomentumScrollEnd={() => {
          isInteractingRef.current = false
          startIdleResumeTimer()
        }}
      >
        {lines.map((line, index) => (
          <LyricRow
            key={`${line.atMs}-${index}`}
            line={line}
            active={index === activeIndex}
            selected={index === selectedRowIndex}
            litCount={index === activeIndex ? litCount : undefined}
            synced={synced}
            onTap={() => handleRowTap(index, line.atMs)}
            onLongPress={() => handleRowLongPress(index)}
            onLayout={(y) => {
              offsets.current[index] = y
            }}
          />
        ))}
      </ScrollView>

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
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.subhead, color: colors.textTertiary },

  // —— 歌词行容器与选中浅色矩形板 ——
  rowContainer: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginHorizontal: -spacing.md,
    backgroundColor: 'transparent',
    justifyContent: 'center',
  },
  rowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
