import { Text, View } from 'react-native'
import { formatBytes } from '@/player/audio-cache-policy'
import { buildStorageBreakdown, type StorageCategory, type StorageSegment, type StorageSnapshot } from '@/lib/storage-breakdown'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

interface Props {
  snapshot: StorageSnapshot | null
}

const CATEGORY_LABELS: Record<StorageCategory, string> = {
  downloads: '轻简音乐下载',
  cache: '缓存',
  other: '其他应用',
  available: '可用空间',
}

export function StorageCapacityChart({ snapshot }: Props) {
  const colors = useThemeColors()
  const styles = useStyles()
  const breakdown = snapshot ? buildStorageBreakdown(snapshot) : null
  const cacheTotal = snapshot
    ? (snapshot.audioCacheBytes ?? 0) + (snapshot.lyricCacheBytes ?? 0) + (snapshot.artworkCacheBytes ?? 0)
    : null
  const segments: StorageSegment[] = breakdown?.segments ?? (snapshot ? [
    { category: 'downloads', bytes: snapshot.downloadsBytes, percent: null },
    { category: 'cache', bytes: cacheTotal, percent: null },
  ] : [])
  const chartColors: Record<StorageCategory, string> = {
    downloads: colors.storageChartDownloads,
    cache: colors.storageChartAudio,
    other: colors.storageChartOther,
    available: colors.bgProgressTrack,
  }
  const availableText = snapshot?.availableBytes === null || snapshot?.availableBytes === undefined
    ? '未知'
    : formatBytes(breakdown?.availableBytes ?? snapshot.availableBytes)
  const totalText = snapshot?.totalBytes === null || snapshot?.totalBytes === undefined || snapshot.totalBytes <= 0
    ? '未知'
    : formatBytes(snapshot.totalBytes)
  const accessibleSummary = breakdown
    ? `设备总容量 ${formatBytes(breakdown.totalBytes)}，可用 ${formatBytes(breakdown.availableBytes)}。` +
      segments.map((segment) => `${CATEGORY_LABELS[segment.category]} ${segment.bytes === null ? '未知' : formatBytes(segment.bytes)}`).join('，')
    : `设备总容量 ${totalText}，可用 ${availableText}。空间比例图暂不可用。`

  return (
    <View style={styles.container}>
      <Text style={styles.title}>存储空间</Text>
      <Text style={styles.subtitle}>总容量 {totalText} · 可用 {availableText}</Text>
      {breakdown ? (
        <View
          style={styles.bar}
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibleSummary}
        >
          {segments.map((segment) => segment.percent !== null && segment.percent > 0 ? (
            <View
              key={segment.category}
              style={{ width: `${segment.percent}%`, backgroundColor: chartColors[segment.category] }}
            />
          ) : null)}
        </View>
      ) : (
        <Text style={styles.unknown}>设备空间数据暂不可用，无法计算占用比例。</Text>
      )}
      <View style={styles.legend}>
        {segments.map((segment) => (
          <View
            key={segment.category}
            style={styles.legendItem}
            accessible
            accessibilityLabel={`${CATEGORY_LABELS[segment.category]}，${segment.bytes === null ? '未知' : formatBytes(segment.bytes)}`}
          >
            <View style={[styles.dot, { backgroundColor: chartColors[segment.category] }]} />
            <Text style={styles.legendLabel}>{CATEGORY_LABELS[segment.category]}</Text>
            <Text style={styles.legendValue}>
              {segment.bytes === null ? '未知' : formatBytes(segment.bytes)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>
        “其他应用”包含系统与其他应用占用的空间；通过总容量扣除轻简音乐与可用空间估算。
      </Text>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.subhead,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  bar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.bgProgressTrack,
    marginTop: 4,
  },
  unknown: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 4,
  },
  legend: {
    gap: 8,
    marginTop: spacing.xs,
  },
  legendItem: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  legendValue: {
    ...typography.caption,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  note: {
    ...typography.caption,
    color: colors.textTertiary,
    lineHeight: 16,
    marginTop: 2,
  },
}))
