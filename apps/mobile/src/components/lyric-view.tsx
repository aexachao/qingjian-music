import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { LyricLine } from '@qj/core-domain'
import { Icon, iconSize, IconButton } from '@/components/icon'
import { useLyricSheet } from '@/lib/lyric-offset'
import { usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 没有下一行时，假设当前行唱这么久（用来算逐字进度） */
const FALLBACK_LINE_MS = 4000
/** 一行歌词唱得比它还短，基本可以断定是「作词 / 作曲 / 制作」这类信息行，整行点亮 */
const META_LINE_MS = 900
/** 长按多久弹出全部歌词面板 */
const LONG_PRESS_MS = 320

/** 未唱到的字用这个灰：跟纯白的「唱到的字」拉开，但又不能太暗看不见 */
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

export function LyricView({ trackId, positionMs, onSeek, songTitle }: LyricViewProps) {
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

  // 本行到下一行的时长；synced 行用它算逐字进度和判断「信息行」
  const spans = useMemo(() => {
    return lines.map((line, index) => {
      const start = line.atMs ?? 0
      const end = lines[index + 1]?.atMs ?? start + FALLBACK_LINE_MS
      return { start, span: Math.max(end - start, 1) }
    })
  }, [lines])

  const activeRatio = useMemo(() => {
    if (activeIndex < 0) return 0
    const { start, span } = spans[activeIndex] ?? { start: 0, span: FALLBACK_LINE_MS }
    return Math.min(Math.max((atMs - start) / span, 0), 1)
  }, [activeIndex, atMs, spans])

  // 高亮行滚到视口中间（放大后也仍然居中）
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
      >
        {lines.map((line, index) => {
          const isActive = index === activeIndex
          const isInfo = synced && spans[index] !== undefined && spans[index]!.span <= META_LINE_MS
          return (
            <LyricRow
              key={`${line.atMs}-${index}`}
              line={line}
              active={isActive}
              info={isInfo}
              ratio={isActive && !isInfo ? activeRatio : 0}
              synced={synced}
              onTap={() => onSeek((line.atMs + offsetMs) / 1000)}
              onLongPress={() => setSheetOpenFor(index)}
              onLayout={(y) => {
                offsets.current[index] = y
              }}
            />
          )
        })}
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
  /** 正在唱的这一句（放大 + 逐字） */
  active: boolean
  /** 歌名 / 创作信息这类行：整句点亮，不做逐字 */
  info: boolean
  /** 当前行唱到的比例，0~1；非当前行传 0 */
  ratio: number
  synced: boolean
  onTap: () => void
  onLongPress: () => void
  onLayout: (y: number) => void
}

/**
 * 一行歌词。非当前行的 props 不变，memo 之后每次进度回调只重渲染当前行。
 * 正在唱的行放大一号，唱到的字逐字变纯白；点击跳唱，长按弹全部歌词。
 */
const LyricRow = memo(function LyricRow({
  line,
  active,
  info,
  ratio,
  synced,
  onTap,
  onLongPress,
  onLayout,
}: LyricRowProps) {
  const chars = active && line.text ? Array.from(line.text) : []
  const sung = Math.round(ratio * chars.length)
  // 信息行整句点亮（不用逐字），否则唱歌行逐字
  const wholeLit = active && (info || !synced)

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
        <Text style={[styles.line, active && styles.lineActive, wholeLit && styles.lineLit]}>
          {active && !info && synced
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
            <Pressable style={({ pressed }) => [styles.sheetButton, pressed && styles.sheetButtonPressed]} onPress={copyAll}>
              <Icon name="copy" size={iconSize.md} color={colors.textPrimary} />
              <Text style={styles.sheetButtonLabel}>复制全部歌词</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.sheetButton, pressed && styles.sheetButtonPressed]} onPress={shareAll}>
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
  // 正在唱：放大一号
  lineActive: { fontSize: 27, lineHeight: 40, fontWeight: '700', color: colors.textPrimary },
  // 信息行 / 无时间轴：整句点亮
  lineLit: { color: colors.textPrimary },
  // 逐字：唱过的纯白，没唱到的灰
  charSung: { color: colors.textPrimary },
  charPending: { color: PENDING_CHAR },
  translation: { ...typography.subhead, color: IDLE_LINE, marginTop: spacing.xs },
  translationActive: { color: colors.textTertiary },
  // —— 全部歌词面板 ——
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.xl },
  sheetCard: {
    backgroundColor: '#1c1c21f2',
    borderRadius: radius.xl,
    maxHeight: '78%',
    overflow: 'hidden',
  },
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
    // 选中的那句整行垫一层底色，一眼能看到
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
