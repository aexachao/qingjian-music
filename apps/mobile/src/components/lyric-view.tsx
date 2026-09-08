import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { LyricLine } from '@qj/core-domain'
import { ErrorState } from '@/components/list-states'
import { Icon, iconSize, IconButton } from '@/components/icon'
import { useLyricSheet } from '@/lib/lyric-offset'
import { usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 没有下一行时，假设当前行唱这么久（逐词进度的兜底） */
const FALLBACK_LINE_MS = 4000
/** 长按多久弹出全部歌词面板 */
const LONG_PRESS_MS = 320
/** 列表已停在顶部还继续往下拽超过多少 pt，算「要退出全屏」 */
const PULL_REVEAL_PT = 36

/** 卡拉OK行里还没唱到的字用这个灰（唱到的字是纯白） */
const PENDING_CHAR = '#ffffff99'
/** 其余（没轮到的）行整体压暗，突出当前行 */
const IDLE_LINE = '#ffffff6b'

interface LyricViewProps {
  trackId: string
  /** 当前播放进度（毫秒） */
  positionMs: number
  /** 点了某一行：跳到那一句开始播（播放与否由调用方决定） */
  onSeek: (seconds: number) => void
  /** 弹「全部歌词」面板时顶部显示的歌名（分享文本里也要用） */
  songTitle?: string
  /** 列表停在顶部还继续往下拽（overscroll）时触发：播放页用它把周边唤回来 */
  onPullTop?: () => void
  /** 手指开始拖动列表：算一次「有操作」，播放页用它重置全屏歌词的静置计时 */
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

export function LyricView({ trackId, positionMs, onSeek, songTitle, onPullTop, onScrollBeginDrag }: LyricViewProps) {
  const offsetMs = usePlayerStore((state) => state.lyricOffsetMs)
  const scrollRef = useRef<ScrollView>(null)
  const offsets = useRef<number[]>([])
  const [viewportHeight, setViewportHeight] = useState(0)
  /** 长按某一行 → 弹全部歌词面板，并把那一行滚到可见 */
  const [sheetOpenFor, setSheetOpenFor] = useState<number | null>(null)

  const query = useLyricSheet(trackId)
  const sheet = query.data ?? null
  const lines = sheet?.lines ?? []
  const synced = sheet?.synced ?? false

  const atMs = positionMs + offsetMs
  const activeIndex = useMemo(() => (synced ? activeIndexOf(lines, atMs) : -1), [lines, atMs, synced])

  // 当前行是卡拉OK行时，唱到第几个字（整行高亮的行用不上）
  const activeKaraoke = activeIndex >= 0 && synced && isKaraokeLine(lines[activeIndex]!)
  const litCount = useMemo(() => {
    if (!activeKaraoke || activeIndex < 0) return undefined
    const nextAt = lines[activeIndex + 1]?.atMs ?? (lines[activeIndex]?.atMs ?? 0) + FALLBACK_LINE_MS
    return countLitChars(lines[activeIndex]!, atMs, nextAt)
  }, [activeKaraoke, activeIndex, atMs, lines])

  // 高亮行滚到视口中间（卡拉OK放大后也仍然居中）
  useEffect(() => {
    if (!synced || activeIndex < 0 || viewportHeight <= 0) return
    const target = offsets.current[activeIndex]
    if (target === undefined) return
    scrollRef.current?.scrollTo({ y: Math.max(target - viewportHeight / 2, 0), animated: true })
  }, [activeIndex, synced, viewportHeight])

  if (query.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  if (lines.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>暂无歌词</Text>
      </View>
    )
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        scrollEventThrottle={16}
        onScroll={(event) => {
          // 顶到头继续往下拽（overscroll 回弹成负偏移）：退出全屏歌词
          if (event.nativeEvent.contentOffset.y < -PULL_REVEAL_PT) onPullTop?.()
        }}
        onScrollBeginDrag={onScrollBeginDrag}
      >
        {lines.map((line, index) => (
          <LyricRow
            key={`${line.atMs}-${index}`}
            line={line}
            active={index === activeIndex}
            litCount={index === activeIndex ? litCount : undefined}
            synced={synced}
            onTap={() => onSeek((line.atMs + offsetMs) / 1000)}
            onLongPress={() => setSheetOpenFor(index)}
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
  litCount,
  synced,
  onTap,
  onLongPress,
  onLayout,
}: LyricRowProps) {
  const karaoke = active && litCount !== undefined
  const chars = karaoke && line.text ? Array.from(line.text) : []
  const sung = Math.min(Math.max(litCount ?? 0, 0), chars.length)

  return (
    <Pressable
      onPress={synced && !active ? onTap : undefined}
      onLongPress={onLongPress}
      delayLongPress={LONG_PRESS_MS}
      onLayout={(event) => onLayout(event.nativeEvent.layout.y)}
      accessibilityRole={synced ? 'button' : 'text'}
      accessibilityLabel={`${line.text}${active ? '（正在播放）' : ''}${synced ? '，点按从这句开始播放，长按查看全部歌词' : ''}`}
    >
      {line.text ? (
        <Text style={[styles.line, active && !karaoke && styles.lineActive, karaoke && styles.lineKaraoke]}>
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
        <Text style={[styles.translation, active && styles.translationActive]}>{line.translation}</Text>
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
  content: { paddingVertical: spacing.xxl * 2, gap: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.subhead, color: colors.textTertiary },
  // 基础：没轮到的行
  line: { ...typography.title, color: IDLE_LINE, lineHeight: 30 },
  // 整行高亮的当前行（普通 LRC / 信息行）：整句白色，跟之前的表现一致
  lineActive: { color: colors.textPrimary },
  // 卡拉OK当前行：放大一号，唱到的字逐字纯白
  lineKaraoke: { fontSize: 27, lineHeight: 40, fontWeight: '700', color: colors.textPrimary },
  charSung: { color: colors.textPrimary },
  charPending: { color: PENDING_CHAR },
  translation: { ...typography.subhead, color: IDLE_LINE, marginTop: spacing.xs },
  translationActive: { color: colors.textTertiary },
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
