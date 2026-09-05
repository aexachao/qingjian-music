import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { LyricLine } from '@qj/core-domain'
import { Icon, iconSize } from '@/components/icon'
import { useServerSession } from '@/lib/server-session'
import { usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 每次点一下调整多少毫秒 */
const OFFSET_STEP_MS = 500
/** 写回防抖：与 web 端一致的 700ms，避免连点时把每一次都发出去 */
const WRITEBACK_DELAY_MS = 700

/** 把偏移毫秒显示成「+0.5 秒」这种人话 */
function formatOffset(offsetMs: number): string {
  if (offsetMs === 0) return '0 秒'
  const sign = offsetMs > 0 ? '+' : '-'
  return `${sign}${(Math.abs(offsetMs) / 1000).toFixed(1)} 秒`
}

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
  const { provider, connection } = useServerSession()
  const offsetMs = usePlayerStore((state) => state.lyricOffsetMs)
  const setLyricOffsetMs = usePlayerStore((state) => state.setLyricOffsetMs)
  const scrollRef = useRef<ScrollView>(null)
  const offsets = useRef<number[]>([])
  const [viewportHeight, setViewportHeight] = useState(0)
  // 待写回的偏移（换歌或卸载时要先刷出去）
  const pending = useRef<{ trackId: string; lyricId: string; offsetMs: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const query = useQuery({
    queryKey: ['lyrics', connection?.id, trackId],
    enabled: Boolean(provider && trackId),
    // lyrics 是能力可选方法：后端不支持时直接当作没有歌词
    queryFn: async () => (provider?.lyrics ? provider.lyrics(trackId) : null),
    staleTime: 30 * 60_000,
  })

  const sheet = query.data ?? null
  const lines = sheet?.lines ?? []
  const synced = sheet?.synced ?? false
  const lyricId = sheet?.id
  const canWriteback = Boolean(provider?.setLyricOffset && provider.capabilities.lyricOffsetWriteback && lyricId)

  // 换歌后用服务端保存的偏移作为初值（store 里的偏移是全局单值）
  const seededTrackId = useRef<string | null>(null)
  useEffect(() => {
    if (!sheet || seededTrackId.current === trackId) return
    seededTrackId.current = trackId
    setLyricOffsetMs(sheet.offsetMs)
  }, [sheet, trackId, setLyricOffsetMs])

  const flushOffset = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const next = pending.current
    pending.current = null
    if (!next || !provider?.setLyricOffset) return
    void provider.setLyricOffset(next).catch((error: unknown) => {
      // 写回失败只影响下次进来的初值，不打断播放
      console.warn('歌词偏移写回失败', error)
    })
  }, [provider])

  const adjustOffset = useCallback(
    (deltaMs: number) => {
      const next = offsetMs + deltaMs
      setLyricOffsetMs(next)
      if (!canWriteback || !lyricId) return
      pending.current = { trackId, lyricId, offsetMs: next }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flushOffset, WRITEBACK_DELAY_MS)
    },
    [canWriteback, flushOffset, lyricId, offsetMs, setLyricOffsetMs, trackId],
  )

  // 换歌或退出歌词页时把没发出去的改动补发
  useEffect(() => () => flushOffset(), [flushOffset, trackId])
  const activeIndex = useMemo(
    () => (synced ? activeIndexOf(lines, positionMs + offsetMs) : -1),
    [lines, positionMs, offsetMs, synced],
  )

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
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
      >
        {lines.map((line, index) => (
          <Pressable
            key={`${line.atMs}-${index}`}
            disabled={!synced}
            onPress={() => onSeek((line.atMs + offsetMs) / 1000)}
            onLayout={(event) => {
              offsets.current[index] = event.nativeEvent.layout.y
            }}
            accessibilityRole={synced ? 'button' : 'text'}
            accessibilityLabel={line.text}
          >
            {line.text ? (
              <Text style={[styles.line, index === activeIndex && styles.lineActive]}>{line.text}</Text>
            ) : (
              // 前奏/间奏这类空行用声波图标占位，不用音符字符
              <Icon name="playing" size={iconSize.lg} color={index === activeIndex ? colors.playing : colors.iconDim} />
            )}
            {line.translation ? (
              <Text style={[styles.translation, index === activeIndex && styles.translationActive]}>
                {line.translation}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      {/* 有时间轴才有「偏移」的意义；能力开着就写回服务端，否则只在本次播放生效 */}
      {synced ? (
        <View style={styles.offsetBar}>
          <Text style={styles.offsetLabel}>歌词偏移 {formatOffset(offsetMs)}</Text>
          <View style={styles.offsetActions}>
            <Pressable
              style={styles.offsetButton}
              onPress={() => adjustOffset(-OFFSET_STEP_MS)}
              accessibilityRole="button"
              accessibilityLabel="歌词延后半秒"
            >
              <Text style={styles.offsetButtonLabel}>-0.5 秒</Text>
            </Pressable>
            <Pressable
              style={styles.offsetButton}
              onPress={() => adjustOffset(OFFSET_STEP_MS)}
              accessibilityRole="button"
              accessibilityLabel="歌词提前半秒"
            >
              <Text style={styles.offsetButtonLabel}>+0.5 秒</Text>
            </Pressable>
            {offsetMs === 0 ? null : (
              <Pressable
                style={styles.offsetButton}
                onPress={() => adjustOffset(-offsetMs)}
                accessibilityRole="button"
                accessibilityLabel="歌词偏移归零"
              >
                <Text style={styles.offsetButtonLabel}>归零</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
  offsetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  offsetLabel: { ...typography.footnote, color: colors.textTertiary },
  offsetActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  offsetButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
  },
  offsetButtonLabel: { ...typography.footnote, color: colors.textPrimary },
  content: { paddingVertical: spacing.xxl * 2, gap: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.subhead, color: colors.textTertiary },
  line: { ...typography.title, color: colors.textTertiary, lineHeight: 30 },
  lineActive: { color: colors.textPrimary },
  translation: { ...typography.subhead, color: colors.textTertiary, marginTop: spacing.xs },
  translationActive: { color: colors.textSecondary },
})
