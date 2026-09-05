import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { colors, radius, spacing, typography } from '@/theme/tokens'

interface TrackRowProps {
  track: Track
  /** 专辑内用序号，其它列表用封面 */
  leading: 'index' | 'cover'
  index: number
  playing?: boolean
  onPress: () => void
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

export function TrackRow({ track, leading, index, playing = false, onPress }: TrackRowProps) {
  const artistText = track.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`播放 ${track.title}，${artistText}`}
    >
      {leading === 'index' ? (
        // 正在播放的那首用声波图标顶掉序号
        playing ? (
          <View style={styles.trackNoSlot}>
            <Icon name="playing" size={iconSize.md} color={colors.playing} />
          </View>
        ) : (
          <Text style={styles.trackNo}>{track.trackNo ?? index + 1}</Text>
        )
      ) : (
        <CoverImage coverId={track.coverId ?? track.album?.coverId} size={48} borderRadius={radius.sm} />
      )}
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, playing && styles.playing]}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {artistText}
          {leading === 'cover' && track.album?.name ? ` — ${track.album.name}` : ''}
        </Text>
      </View>
      <Text style={styles.duration}>{formatDuration(track.durationMs)}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  trackNo: { ...typography.footnote, color: colors.textTertiary, width: 28, textAlign: 'center' },
  trackNoSlot: { width: 28, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  title: { ...typography.callout, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  duration: { ...typography.caption, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  playing: { color: colors.playing },
})
