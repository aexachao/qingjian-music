import { Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useToast } from '@/components/toast'
import {
  useExternalSourcesStore,
  normalizeBaseUrl,
  type LyricSourceType,
  type MusicInfoSourceType,
} from '@/lib/external-source'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

const LYRIC_TYPES: { value: LyricSourceType; label: string }[] = [
  { value: 'none', label: '关闭' },
  { value: 'netease', label: '网易云(逐字)' },
  { value: 'lrcapi', label: 'LrcAPI' },
]

const INFO_TYPES: { value: MusicInfoSourceType; label: string }[] = [
  { value: 'none', label: '关闭' },
  { value: 'netease', label: '网易云' },
  { value: 'qq', label: 'QQ音乐' },
]

async function testConnection(baseUrl: string, token: string | undefined): Promise<boolean> {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    // 探活：命中任一 200 即认为地址可达（不同实现根路径不同，容错处理）
    const res = await fetch(base, {
      signal: controller.signal,
      headers: token ? { Authorization: token } : {},
    })
    return res.status > 0 && res.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function ExternalSourcesScreen() {
  const styles = useStyles()
  const lyrics = useExternalSourcesStore((s) => s.lyrics)
  const musicInfo = useExternalSourcesStore((s) => s.musicInfo)
  const setLyrics = useExternalSourcesStore((s) => s.setLyrics)
  const setMusicInfo = useExternalSourcesStore((s) => s.setMusicInfo)

  return (
    <>
      <Stack.Screen options={{ title: '外部数据源' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          默认只用飞牛音乐的数据。填入你自建的国内服务地址后，歌词可显示逐字高亮、艺人/专辑可显示完整度。
          App 不内置任何外部源，仅访问你填写的地址。
        </Text>

        {/* 歌词源 */}
        <SourceCard<LyricSourceType>
          title="歌词源"
          hint="优先逐字(网易云 yrc)，其次行级；飞牛已有歌词时作补充。"
          types={LYRIC_TYPES}
          value={lyrics.type}
          baseUrl={lyrics.baseUrl}
          token={lyrics.token ?? ''}
          onType={(type) => setLyrics({ type })}
          onBaseUrl={(baseUrl) => setLyrics({ baseUrl })}
          onToken={(token) => setLyrics({ token })}
        />

        {/* 音乐信息源 */}
        <SourceCard<MusicInfoSourceType>
          title="音乐信息源"
          hint="用于专辑完整曲目、艺人全部作品(完整度)。"
          types={INFO_TYPES}
          value={musicInfo.type}
          baseUrl={musicInfo.baseUrl}
          token={musicInfo.token ?? ''}
          onType={(type) => setMusicInfo({ type })}
          onBaseUrl={(baseUrl) => setMusicInfo({ baseUrl })}
          onToken={(token) => setMusicInfo({ token })}
        />
      </ScrollView>
    </>
  )
}

function SourceCard<T extends string>({
  title,
  hint,
  types,
  value,
  baseUrl,
  token,
  onType,
  onBaseUrl,
  onToken,
}: {
  title: string
  hint: string
  types: { value: T; label: string }[]
  value: T
  baseUrl: string
  token: string
  onType: (t: T) => void
  onBaseUrl: (s: string) => void
  onToken: (s: string) => void
}) {
  const styles = useStyles()
  const colors = useThemeColors()
  const toast = useToast()
  const [testing, setTesting] = useState(false)
  const enabled = value !== 'none'

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardHint}>{hint}</Text>

      <View style={styles.chipsRow}>
        {types.map((t) => {
          const active = t.value === value
          return (
            <Pressable
              key={t.value}
              onPress={() => onType(t.value)}
              style={[styles.chip, active && { backgroundColor: colors.stateSelected }]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && { color: colors.actionText }]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {enabled ? (
        <>
          <Text style={styles.fieldLabel}>服务地址</Text>
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={onBaseUrl}
            placeholder="http://192.168.x.x:端口"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.fieldLabel}>鉴权 Token（可选）</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={onToken}
            placeholder="留空表示无鉴权"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Pressable
            disabled={testing || !baseUrl.trim()}
            onPress={async () => {
              setTesting(true)
              const ok = await testConnection(baseUrl, token || undefined)
              setTesting(false)
              toast(ok ? '连接成功' : '连接失败，请检查地址')
            }}
            style={[styles.testButton, (!baseUrl.trim() || testing) && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="测试连接"
          >
            <Text style={styles.testButtonText}>{testing ? '测试中…' : '测试连接'}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: { padding: spacing.lg, paddingBottom: 40, gap: spacing.md },
  intro: { ...typography.footnote, color: colors.textSecondary, lineHeight: 20 },
  card: {
    backgroundColor: colors.bgListItem,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.callout, fontWeight: '600', color: colors.textPrimary },
  cardHint: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.bgListItemSoft,
  },
  chipText: { ...typography.subhead, color: colors.textSecondary },
  fieldLabel: { ...typography.footnote, color: colors.textSecondary, marginTop: 4 },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  testButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.bgListItemSoft,
  },
  testButtonText: { ...typography.subhead, fontWeight: '600', color: colors.actionText },
}))
