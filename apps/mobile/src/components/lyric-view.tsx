import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { LyricLine } from '@qj/core-domain'
import { Icon, iconSize } from '@/components/icon'
import { useServerSession } from '@/lib/server-session'
import { usePlayerStore } from '@/player/store'
import { colors, spacing, typography } from '@/theme/tokens'

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
  const scrollRef = useRef<ScrollView>(null)
  const offsets = useRef<number[]>([])
  const [viewportHeight, setViewportHeight] = useState(0)

  const query = useQuery({
    queryKey: ['lyrics', connection?.id, trackId],
    enabled: Boolean(provider && trackId),
    // lyrics 是能力可选方法：后端不支持时直接当作没有歌词
    queryFn: async () => (provider?.lyrics ? provider.lyrics(trackId) : null),
    staleTime: 30 * 60_000,
  })

  const lines = query.data?.lines ?? []
  const synced = query.data?.synced ?? false
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
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingVertical: spacing.xxl * 2, gap: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.subhead, color: colors.textTertiary },
  line: { ...typography.title, color: colors.textTertiary, lineHeight: 30 },
  lineActive: { color: colors.textPrimary },
  translation: { ...typography.subhead, color: colors.textTertiary, marginTop: spacing.xs },
  translationActive: { color: colors.textSecondary },
})
