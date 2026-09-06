import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { LyricLine } from '@qj/core-domain'
import { Icon, iconSize } from '@/components/icon'
import { useLyricSheet } from '@/lib/lyric-offset'
import { usePlayerStore } from '@/player/store'
import { colors, spacing, typography } from '@/theme/tokens'

/** 没有下一行时，假设当前行唱这么久（用来算逐字进度） */
const FALLBACK_LINE_MS = 4000

interface LyricViewProps {
  trackId: string
  /** 当前播放进度（毫秒） */
  positionMs: number
  onSeek: (seconds: number) => void
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

export function LyricView({ trackId, positionMs, onSeek }: LyricViewProps) {
  const offsetMs = usePlayerStore((state) => state.lyricOffsetMs)
  const scrollRef = useRef<ScrollView>(null)
  const offsets = useRef<number[]>([])
  const [viewportHeight, setViewportHeight] = useState(0)

  const query = useLyricSheet(trackId)
  const sheet = query.data ?? null
  const lines = sheet?.lines ?? []
  const synced = sheet?.synced ?? false

  const atMs = positionMs + offsetMs
  const activeIndex = useMemo(() => (synced ? activeIndexOf(lines, atMs) : -1), [lines, atMs, synced])

  // 当前行唱到第几个字：按「本行到下一行」的时长均分，飞牛的歌词只有整行时间轴
  const activeRatio = useMemo(() => {
    if (activeIndex < 0) return 0
    const start = lines[activeIndex]?.atMs ?? 0
    const end = lines[activeIndex + 1]?.atMs ?? start + FALLBACK_LINE_MS
    const span = Math.max(end - start, 1)
    return Math.min(Math.max((atMs - start) / span, 0), 1)
  }, [activeIndex, atMs, lines])

  // 高亮行滚到视口中间
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
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
    >
      {lines.map((line, index) => (
        <LyricRow
          key={`${line.atMs}-${index}`}
          line={line}
          active={index === activeIndex}
          ratio={index === activeIndex ? activeRatio : 0}
          synced={synced}
          onPress={() => onSeek((line.atMs + offsetMs) / 1000)}
          onLayout={(y) => {
            offsets.current[index] = y
          }}
        />
      ))}
    </ScrollView>
  )
}

interface LyricRowProps {
  line: LyricLine
  active: boolean
  /** 当前行唱到的比例，0~1；非当前行传 0 */
  ratio: number
  synced: boolean
  onPress: () => void
  onLayout: (y: number) => void
}

/**
 * 一行歌词。非当前行的 props 不变，memo 之后每次进度回调只重渲染当前行。
 * 当前行按比例逐字点亮：已唱的字用主色，没唱的用次色。
 */
const LyricRow = memo(function LyricRow({ line, active, ratio, synced, onPress, onLayout }: LyricRowProps) {
  const chars = active && line.text ? Array.from(line.text) : []
  const sung = Math.round(ratio * chars.length)

  return (
    <Pressable
      disabled={!synced}
      onPress={onPress}
      onLayout={(event) => onLayout(event.nativeEvent.layout.y)}
      accessibilityRole={synced ? 'button' : 'text'}
      accessibilityLabel={line.text}
    >
      {line.text ? (
        <Text style={[styles.line, active && styles.lineActive]}>
          {active
            ? chars.map((char, index) => (
                <Text key={index} style={index < sung ? styles.charSung : styles.charPending}>
                  {char}
                </Text>
              ))
            : line.text}
        </Text>
      ) : (
        // 前奏/间奏这类空行用声波图标占位，不用音符字符
        <Icon name="playing" size={iconSize.lg} color={active ? colors.playing : colors.iconDim} />
      )}
      {line.translation ? (
        <Text style={[styles.translation, active && styles.translationActive]}>{line.translation}</Text>
      ) : null}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingVertical: spacing.xxl * 2, gap: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.subhead, color: colors.textTertiary },
  // 未唱的行压到 40%，当前行才够跳出来（对齐 Apple Music 的对比度）
  line: { ...typography.title, color: colors.textQuaternary, lineHeight: 30 },
  lineActive: { color: colors.textPrimary },
  // 逐字：唱过的纯白，还没唱到的 60%，差一档才看得出来
  charSung: { color: colors.textPrimary },
  charPending: { color: colors.textTertiary },
  translation: { ...typography.subhead, color: colors.textQuaternary, marginTop: spacing.xs },
  translationActive: { color: colors.textTertiary },
})
