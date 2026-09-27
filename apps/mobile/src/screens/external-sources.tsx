import { Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { useToast } from '@/components/toast'
import {
  useExternalSourcesStore,
  normalizeBaseUrl,
  SOURCE_CAPS,
  type SourceService,
  type SourceType,
} from '@/lib/external-source'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

const ADDABLE: SourceType[] = ['netease', 'lrcapi', 'qq']

type TestState = 'unknown' | 'testing' | 'ok' | 'fail'

async function testConnection(baseUrl: string, token: string | undefined): Promise<boolean> {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(base, { signal: controller.signal, headers: token ? { Authorization: token } : {} })
    return res.status > 0 && res.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function ExternalSourcesScreen() {
  const styles = useStyles()
  const colors = useThemeColors()
  const services = useExternalSourcesStore((s) => s.services)
  const addService = useExternalSourcesStore((s) => s.addService)

  return (
    <>
      <Stack.Screen options={{ title: '外部数据源' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          默认只用飞牛音乐的数据。添加你自建的国内服务后，歌词可显示逐字高亮、艺人/专辑可显示完整度。
          一个网易云实例即可同时供歌词与信息，无需重复填写。App 不内置任何源，仅访问你填写的地址。
        </Text>

        {services.length === 0 ? (
          <Text style={styles.empty}>还没有添加任何服务。点下方按钮添加。</Text>
        ) : (
          services.map((svc) => <ServiceCard key={svc.id} service={svc} />)
        )}

        <Text style={styles.addTitle}>添加服务</Text>
        <View style={styles.addRow}>
          {ADDABLE.map((type) => (
            <Pressable
              key={type}
              onPress={() => addService(type)}
              style={styles.addChip}
              accessibilityRole="button"
              accessibilityLabel={`添加 ${SOURCE_CAPS[type].label}`}
            >
              <Text style={[styles.addChipText, { color: colors.actionText }]}>+ {SOURCE_CAPS[type].label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </>
  )
}

function ServiceCard({ service }: { service: SourceService }) {
  const styles = useStyles()
  const colors = useThemeColors()
  const toast = useToast()
  const update = useExternalSourcesStore((s) => s.updateService)
  const remove = useExternalSourcesStore((s) => s.removeService)
  const [test, setTest] = useState<TestState>('unknown')

  const caps = SOURCE_CAPS[service.type]
  const statusText =
    test === 'ok' ? '已连接' : test === 'fail' ? '连接失败' : test === 'testing' ? '测试中…' : '未测试'
  const statusColor =
    test === 'ok' ? colors.actionText : test === 'fail' ? colors.danger : colors.textTertiary

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{caps.label}</Text>
        <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
        <Pressable onPress={() => remove(service.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="删除服务">
          <Text style={[styles.delete, { color: colors.danger }]}>删除</Text>
        </Pressable>
      </View>
      <Text style={styles.cardHint}>{caps.hint}</Text>

      <Text style={styles.fieldLabel}>服务地址</Text>
      <TextInput
        style={styles.input}
        value={service.baseUrl}
        onChangeText={(baseUrl) => {
          update(service.id, { baseUrl })
          setTest('unknown')
        }}
        placeholder="http://192.168.x.x:端口"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text style={styles.fieldLabel}>鉴权 Token（可选）</Text>
      <TextInput
        style={styles.input}
        value={service.token ?? ''}
        onChangeText={(token) => update(service.id, { token })}
        placeholder="留空表示无鉴权"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      {/* 能力开关：只显示该类型支持的 */}
      {caps.lyrics ? (
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>用于逐字歌词</Text>
          <Switch value={service.useLyrics} onValueChange={(v) => update(service.id, { useLyrics: v })} />
        </View>
      ) : null}
      {caps.musicInfo ? (
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>用于完整度信息</Text>
          <Switch value={service.useMusicInfo} onValueChange={(v) => update(service.id, { useMusicInfo: v })} />
        </View>
      ) : null}

      <Pressable
        disabled={test === 'testing' || !service.baseUrl.trim()}
        onPress={async () => {
          setTest('testing')
          const ok = await testConnection(service.baseUrl, service.token || undefined)
          setTest(ok ? 'ok' : 'fail')
          toast(ok ? '连接成功' : '连接失败，请检查地址')
        }}
        style={[styles.testButton, (!service.baseUrl.trim() || test === 'testing') && { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel="测试连接"
      >
        <Text style={[styles.testButtonText, { color: colors.actionText }]}>
          {test === 'testing' ? '测试中…' : '测试连接'}
        </Text>
      </Pressable>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: { padding: spacing.lg, paddingBottom: 40, gap: spacing.md },
  intro: { ...typography.footnote, color: colors.textSecondary, lineHeight: 20 },
  empty: { ...typography.body, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
  card: {
    backgroundColor: colors.bgListItem,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.callout, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  status: { ...typography.footnote },
  delete: { ...typography.footnote },
  cardHint: { ...typography.caption, color: colors.textTertiary },
  fieldLabel: { ...typography.footnote, color: colors.textSecondary, marginTop: 4 },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 4,
  },
  toggleLabel: { ...typography.body, color: colors.textPrimary },
  testButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.bgListItemSoft,
  },
  testButtonText: { ...typography.subhead, fontWeight: '600' },
  addTitle: { ...typography.footnote, color: colors.textSecondary, marginTop: spacing.sm },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  addChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.bgListItemSoft,
  },
  addChipText: { ...typography.subhead, fontWeight: '600' },
}))
