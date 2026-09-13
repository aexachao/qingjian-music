import { useLocalSearchParams, Stack } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useServerSession } from '@/lib/server-session'
import { useToast } from '@/components/toast'
import { CoverImage } from '@/components/cover-image'
import { createThemedStyles } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'
import { formatBytes } from '@/player/audio-cache-policy'

function formatDuration(ms: number | string | undefined): string {
  const n = typeof ms === 'string' ? Number(ms) : ms ?? 0
  if (!n) return '--'
  const sec = Math.round(n / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatBitrate(bps: number | undefined): string {
  if (!bps) return '--'
  return `${Math.round(bps / 1000)} kbps`
}

function formatSampleRate(hz: number | undefined): string {
  if (!hz) return '--'
  return `${(hz / 1000).toFixed(1)} kHz`
}

export default function TrackInfoScreen() {
  const { trackId, title, artist, album, duration } = useLocalSearchParams<{
    trackId: string
    title?: string
    artist?: string
    album?: string
    duration?: string
  }>()
  const { provider, connection } = useServerSession()
  const toast = useToast()
  const styles = useStyles()

  const { data: spec, isPending } = useQuery({
    queryKey: ['audio-spec', connection?.id, trackId],
    enabled: Boolean(provider && trackId && provider.capabilities.audioSpec),
    queryFn: async () => (provider!.audioSpec ? provider!.audioSpec(trackId) : null),
    staleTime: 30 * 60_000,
  })

  const infoRows = [
    { label: '时长', value: formatDuration(duration) },
    { label: '编码格式', value: spec?.codec || '--' },
    { label: '文件格式', value: spec?.format || '--' },
    { label: '容器', value: spec?.container || '--' },
    { label: '码率', value: formatBitrate(spec?.bitrateBps) },
    { label: '采样率', value: formatSampleRate(spec?.sampleRateHz) },
    { label: '位深', value: spec?.bitDepth ? `${spec.bitDepth} bit` : '--' },
    { label: '声道', value: spec?.channels ? `${spec.channels}` : '--' },
    { label: '文件大小', value: spec?.sizeBytes ? formatBytes(spec.sizeBytes) : '--' },
  ]

  return (
    <>
      <Stack.Screen options={{ title: '歌曲信息' }} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* 基本信息 */}
        <View style={styles.header}>
          <CoverImage size={120} borderRadius={radius.lg} />
          <Text style={styles.title}>{title || '未知歌曲'}</Text>
          <Text style={styles.subtitle}>{artist || '未知艺术家'}</Text>
          {album ? <Text style={styles.album}>{album}</Text> : null}
        </View>

        {/* 音频规格 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>音频规格</Text>
          {isPending ? (
            <Text style={styles.loading}>加载中…</Text>
          ) : (
            infoRows.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value} numberOfLines={1}>
                  {row.value}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* 文件路径 */}
        {spec?.path ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>文件路径</Text>
            <Text style={styles.path}>{spec.path}</Text>
          </View>
        ) : null}
      </ScrollView>
    </>
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  album: {
    ...typography.footnote,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  section: {
    backgroundColor: colors.bgListItem,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  loading: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  value: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  path: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
  },
}))
