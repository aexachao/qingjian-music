import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Track } from '@qj/core-domain'
import { useServerSession } from '@/lib/server-session'
import { useToast } from '@/components/toast'
import { CoverImage } from '@/components/cover-image'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
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

/** 把 "12" / "" 解析成 number | null；非法输入退回 null */
function parseIntOrNull(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

function parseTrack(json: string | undefined): Track | null {
  if (!json) return null
  try {
    return JSON.parse(json) as Track
  } catch {
    return null
  }
}

export default function TrackInfoScreen() {
  const { trackId, title, artist, album, duration, coverId, trackJson } = useLocalSearchParams<{
    trackId: string
    title?: string
    artist?: string
    album?: string
    duration?: string
    coverId?: string
    trackJson?: string
  }>()
  const { provider, connection } = useServerSession()
  const styles = useStyles()
  const colors = useThemeColors()
  const toast = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()

  const track = useMemo(() => parseTrack(trackJson), [trackJson])
  // 只有后端支持写回、且手上有完整曲目（拿得到 artists/genres 的 GUID）时才允许编辑
  const canEdit = Boolean(provider?.capabilities.metadataWrite && provider?.updateTrackMetadata && track)

  // ---- 可编辑字段的表单态（初值取自完整曲目）----
  const [form, setForm] = useState(() => ({
    title: track?.title ?? title ?? '',
    album: track?.album?.name ?? album ?? '',
    year: track?.year != null ? String(track.year) : '',
    trackNo: track?.trackNo != null ? String(track.trackNo) : '',
    discNo: track?.discNo != null ? String(track.discNo) : '',
  }))
  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const dirty = useMemo(() => {
    if (!track) return false
    return (
      form.title.trim() !== (track.title ?? '') ||
      form.album.trim() !== (track.album?.name ?? '') ||
      parseIntOrNull(form.year) !== (track.year ?? null) ||
      parseIntOrNull(form.trackNo) !== (track.trackNo ?? null) ||
      parseIntOrNull(form.discNo) !== (track.discNo ?? null)
    )
  }, [form, track])

  const save = useMutation({
    mutationFn: async () => {
      if (!provider?.updateTrackMetadata || !track) throw new Error('当前后端不支持编辑')
      if (!form.title.trim()) throw new Error('名称不能为空')
      await provider.updateTrackMetadata({
        trackId: track.id,
        title: form.title.trim(),
        albumName: form.album.trim() || null,
        // 歌手/风格暂不在此页改（需多选选择器），保留当前值原样写回
        artistIds: track.artists.map((a) => a.id),
        genreIds: track.genres.map((g) => g.id),
        coverId: track.coverId ?? null,
        year: parseIntOrNull(form.year),
        trackNo: parseIntOrNull(form.trackNo),
        discNo: parseIntOrNull(form.discNo),
      })
    },
    onSuccess: async () => {
      toast('已保存')
      // 编辑会影响各处曲目列表展示，整体失效让其自然刷新
      await queryClient.invalidateQueries()
      router.back()
    },
    onError: (error: unknown) => {
      toast(error instanceof Error ? error.message : '保存失败，请稍后再试')
    },
  })

  const { data: spec, isPending } = useQuery({
    queryKey: ['audio-spec', connection?.id, trackId],
    enabled: Boolean(provider && trackId && provider.capabilities.audioSpec),
    queryFn: async () => (provider!.audioSpec ? provider!.audioSpec(trackId) : null),
    staleTime: 30 * 60_000,
  })

  const specRows = [
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

  const artistText = track?.artists.map((a) => a.name).join(' / ') || artist || '未知艺术家'
  const genreText = track?.genres.map((g) => g.name).join(' / ') || ''

  return (
    <>
      <Stack.Screen
        options={{
          title: '歌曲信息',
          headerRight: canEdit
            ? () => (
                <Pressable
                  disabled={!dirty || save.isPending}
                  onPress={() => save.mutate()}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="保存"
                >
                  <Text
                    style={[
                      styles.saveButton,
                      { color: !dirty || save.isPending ? colors.disabledText : colors.actionText },
                    ]}
                  >
                    保存
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* 封面 + 概要 */}
        <View style={styles.header}>
          <View style={styles.coverShadowWrapper}>
            <CoverImage coverId={coverId || track?.coverId} size={130} borderRadius={radius.album} />
          </View>
          <Text style={styles.title}>{form.title || title || '未知歌曲'}</Text>
          <Text style={styles.subtitle}>{artistText}</Text>
        </View>

        {/* 可编辑区（后端支持写回且有完整曲目时）*/}
        {canEdit ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>编辑</Text>
            <EditField label="名称" value={form.title} onChangeText={set('title')} placeholder="请输入歌曲名称" />
            <EditField label="专辑" value={form.album} onChangeText={set('album')} placeholder="请输入专辑名称" />
            <EditField label="年份" value={form.year} onChangeText={set('year')} placeholder="请输入发布年份" keyboardType="number-pad" />
            <EditField label="曲目序号" value={form.trackNo} onChangeText={set('trackNo')} placeholder="曲目序号" keyboardType="number-pad" />
            <EditField label="光盘序号" value={form.discNo} onChangeText={set('discNo')} placeholder="光盘序号" keyboardType="number-pad" last />
            {/* 歌手/风格/封面 的编辑需要多选选择器与上传，下一步支持；此处只读展示 */}
            <View style={styles.readonlyHint}>
              <Text style={styles.hintLabel}>歌手</Text>
              <Text style={styles.hintValue} numberOfLines={1}>{artistText}</Text>
            </View>
            {genreText ? (
              <View style={styles.readonlyHint}>
                <Text style={styles.hintLabel}>风格</Text>
                <Text style={styles.hintValue} numberOfLines={1}>{genreText}</Text>
              </View>
            ) : null}
            <Text style={styles.editNote}>歌手 / 风格 / 封面的编辑即将支持，保存时会原样保留。</Text>
          </View>
        ) : null}

        {/* 音频规格（只读）*/}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>音频规格</Text>
          {isPending ? (
            <Text style={styles.loading}>加载中…</Text>
          ) : (
            specRows.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value} numberOfLines={1}>
                  {row.value}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* 文件路径（只读）*/}
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

function EditField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  last,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'number-pad'
  last?: boolean
}) {
  const styles = useStyles()
  const colors = useThemeColors()
  return (
    <View style={[styles.editRow, last && styles.editRowLast]}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType ?? 'default'}
        returnKeyType="done"
      />
    </View>
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
  coverShadowWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
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
  saveButton: {
    ...typography.body,
    fontWeight: '600',
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
  editRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  editRowLast: {
    borderBottomWidth: 0,
  },
  editLabel: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: 4,
  },
  readonlyHint: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  hintLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  hintValue: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  editNote: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
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
