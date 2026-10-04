import { Stack } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, Modal, Platform, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MenuView } from '@react-native-menu/menu'
import { useToast } from '@/components/toast'
import { useConfirm } from '@/components/confirm-modal'
import { Icon } from '@/components/icon'
import { stackHeaderIconStyle } from '@/components/stack-header-icon-style'
import {
  useExternalSourcesStore,
  normalizeBaseUrl,
  SOURCE_CAPS,
  type SourceService,
  type SourceType,
} from '@/lib/external-source'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography, radius } from '@/theme/tokens'
import { classifyConnectionResponse, ConnectionTestSequence, runConnectionTest, validateExternalSourceUrl } from '@/lib/external-source-form'
import { useBottomSpace } from '@/lib/bottom-space'

type TestState = 'unknown' | 'testing' | 'reachable' | 'auth-failed' | 'fail'
const ADD_SOURCE_ACTIONS = [
  { id: 'netease', title: SOURCE_CAPS.netease.label },
  { id: 'lrcapi', title: SOURCE_CAPS.lrcapi.label },
  { id: 'qq', title: `${SOURCE_CAPS.qq.label}（暂未接入）`, subtitle: '暂不可添加', attributes: { disabled: true } },
]

async function testConnection(baseUrl: string, token: string | undefined, signal: AbortSignal): Promise<'reachable' | 'auth-failed' | 'failed'> {
  const base = normalizeBaseUrl(baseUrl)
  try {
    const res = await fetch(base, { signal, headers: token ? { Authorization: token } : {} })
    const result = classifyConnectionResponse(res.status)
    return result
  } catch {
    return 'failed'
  }
}

export function ExternalSourcesScreen() {
  const styles = useStyles()
  const colors = useThemeColors()
  const bottom = useBottomSpace()
  const services = useExternalSourcesStore((s) => s.services)

  const [editingService, setEditingService] = useState<SourceService | null>(null)
  const [addingType, setAddingType] = useState<SourceType | null>(null)

  return (
    <>
      <Stack.Screen
        options={{
          title: '外部数据源',
          headerRight: () => (
            <MenuView
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === 'netease' || nativeEvent.event === 'lrcapi') setAddingType(nativeEvent.event)
              }}
              actions={ADD_SOURCE_ACTIONS}
            >
              <Pressable
                hitSlop={12}
                style={({ pressed }) => stackHeaderIconStyle(pressed, colors.bgListItemHover)}
                accessibilityRole="button"
                accessibilityLabel="添加外部数据源"
              >
                <Icon name="add" size={24} color={colors.textPrimary} />
              </Pressable>
            </MenuView>
          )
        }}
      />
      <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
        {services.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.bgButtonSecondary }]}>
              <Icon name="server" size={24} color={colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>添加外部数据源</Text>
            <Text style={styles.emptyDescription}>连接你部署的服务，补充歌词和曲库信息。</Text>
            <MenuView
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === 'netease' || nativeEvent.event === 'lrcapi') setAddingType(nativeEvent.event)
              }}
              actions={ADD_SOURCE_ACTIONS}
            >
              <Pressable style={styles.emptyAddButton} accessibilityRole="button" accessibilityLabel="添加数据源">
                <Text style={styles.emptyAddText}>添加数据源</Text>
              </Pressable>
            </MenuView>
          </View>
        ) : (
          <View style={styles.grid}>
            {services.map((svc) => {
              const caps = SOURCE_CAPS[svc.type]
              return (
                <Pressable
                  key={svc.id}
                  style={({pressed}) => [styles.gridCard, pressed && styles.cardPressed]}
                  onPress={() => setEditingService(svc)}
                  accessibilityRole="button"
                >
                  <View style={[styles.cardIconBox, { backgroundColor: colors.bgButtonSecondary }]}>
                    <Icon name="server" size={24} color={colors.textPrimary} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{caps.label}{svc.type === 'qq' ? ' · 暂未接入' : ''}</Text>
                    <Text style={styles.cardSub}>{safeHostname(svc.baseUrl) || '未配置有效地址'}</Text>
                    <Text style={styles.cardSub}>
                      {[svc.useLyrics && (svc.type === 'lrcapi' ? '行级歌词' : '逐字歌词'), svc.useMusicInfo && '曲库完整度'].filter(Boolean).join(' · ') || '未启用用途'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
      </View>

      {editingService && (
        <EditModal
          service={editingService}
          mode="edit"
          onClose={() => setEditingService(null)}
        />
      )}

      {addingType && (
        <EditModal
          service={{
            id: 'temp',
            type: addingType,
            baseUrl: '',
            token: '',
            useLyrics: SOURCE_CAPS[addingType].lyrics,
            useMusicInfo: SOURCE_CAPS[addingType].musicInfo,
          }}
          mode="add"
          onClose={() => setAddingType(null)}
        />
      )}
    </>
  )
}

function safeHostname(baseUrl: string): string {
  try {
    const value = normalizeBaseUrl(baseUrl)
    if (!value) return ''
    return new URL(value).hostname
  } catch {
    return ''
  }
}

function EditModal({ service, mode, onClose }: { service: SourceService, mode: 'add' | 'edit', onClose: () => void }) {
  const styles = useStyles()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const confirm = useConfirm()

  const add = useExternalSourcesStore((s) => s.addService)
  const update = useExternalSourcesStore((s) => s.updateService)
  const remove = useExternalSourcesStore((s) => s.removeService)

  const [baseUrl, setBaseUrl] = useState(service.baseUrl)
  const [token, setToken] = useState(service.token || '')
  const [useLyrics, setUseLyrics] = useState(service.useLyrics)
  const [useMusicInfo, setUseMusicInfo] = useState(service.useMusicInfo)
  const [test, setTest] = useState<TestState>('unknown')
  const [testMessage, setTestMessage] = useState('')
  const testSequenceRef = useRef(new ConnectionTestSequence())
  useEffect(() => () => testSequenceRef.current.invalidate(), [])

  const caps = SOURCE_CAPS[service.type]
  const urlError = validateExternalSourceUrl(baseUrl)
  const displayedUrlError = baseUrl.trim() ? urlError : null
  const qqUnavailable = service.type === 'qq'
  const invalidateTest = () => {
    testSequenceRef.current.invalidate()
    setTest('unknown')
    setTestMessage('')
  }

  const handleSave = () => {
    if (urlError) return
    const normalizedUrl = normalizeBaseUrl(baseUrl)
    if (mode === 'add') {
      add(service.type, {
        baseUrl: normalizedUrl,
        token: token || undefined,
        useLyrics,
        useMusicInfo,
      })
      toast('添加成功')
    } else {
      update(service.id, {
        baseUrl: normalizedUrl,
        token: token || undefined,
        useLyrics,
        useMusicInfo,
      })
      toast('保存成功')
    }
    onClose()
  }

  const handleDelete = () => {
    confirm({
      title: '删除外部数据源',
      message: `确定删除「${caps.label}」数据源吗？`,
      confirmText: '删除',
      cancelText: '取消',
      destructive: true,
      onConfirm: () => { remove(service.id); onClose() },
    })
  }

  const handleTest = async () => {
    if (urlError) return
    const { id, controller } = testSequenceRef.current.begin()
    setTest('testing')
    setTestMessage('')
    const outcome = await runConnectionTest((signal) => testConnection(baseUrl, token || undefined, signal), controller)
    if (!testSequenceRef.current.isCurrent(id)) return
    setTest(outcome.result === 'reachable' ? 'reachable' : outcome.result === 'auth-failed' ? 'auth-failed' : 'fail')
    setTestMessage(outcome.timedOut ? '连接超时，请检查地址和网络后重试' : outcome.result === 'reachable' ? '服务已响应，尚未验证具体接口可用性' : outcome.result === 'auth-failed' ? '服务已响应，但鉴权失败；请检查访问令牌' : '未能连接服务，请检查地址和网络')
  }

  const statusText =
    test === 'reachable' ? '可连接' : test === 'auth-failed' ? '鉴权失败' : test === 'fail' ? '连接失败' : test === 'testing' ? '测试中…' : '未测试'
  const statusColor =
    test === 'reachable' ? colors.stateSelected : test === 'auth-failed' || test === 'fail' ? colors.danger : colors.textTertiary

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.sheetRoot, { backgroundColor: colors.bgPrimary, paddingTop: Platform.OS === 'ios' ? 0 : insets.top, paddingBottom: insets.bottom }]}
      >
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn} accessibilityRole="button">
            <Text style={styles.headerBtnText}>取消</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>{mode === 'add' ? '添加' : '编辑'}{caps.label}</Text>
          <Pressable onPress={handleSave} disabled={Boolean(urlError)} style={styles.headerBtn} accessibilityRole="button" accessibilityState={{ disabled: Boolean(urlError) }}>
            <Text style={[styles.headerBtnText, { color: urlError ? colors.disabledText : colors.actionText, fontWeight: '600' }]}>完成</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>连接信息</Text>
          <View style={styles.card}>
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>服务地址</Text>
              <TextInput
                style={styles.input}
                value={baseUrl}
                onChangeText={(val) => { setBaseUrl(val); invalidateTest() }}
                placeholder="https://music.example.com"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {displayedUrlError ? <Text style={styles.fieldError}>{displayedUrlError}</Text> : !baseUrl.trim() ? <Text style={styles.fieldHint}>填写服务提供的 HTTP 或 HTTPS 地址</Text> : null}
            </View>
            <View style={styles.divider} />
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>访问令牌</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={(val) => { setToken(val); invalidateTest() }}
                placeholder="无鉴权可留空"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            </View>

          </View>

          <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>使用范围</Text>
          <View style={styles.card}>
            {caps.lyrics && <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.label}>{service.type === 'lrcapi' ? '用于行级歌词' : '用于逐字歌词'}</Text>
                {service.type === 'lrcapi' && <Text style={styles.fieldHint}>LrcAPI 提供行级歌词，不含逐字时间轴</Text>}
              </View>
              <Switch value={useLyrics} onValueChange={setUseLyrics} trackColor={{ false: colors.bgButtonSecondary, true: colors.stateSelected }} thumbColor={colors.textOnAccent} accessibilityLabel={service.type === 'lrcapi' ? '使用此数据源提供行级歌词' : '使用此数据源提供逐字歌词'} />
            </View>}
            {caps.lyrics && caps.musicInfo && <View style={styles.divider} />}
            {caps.musicInfo && <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.label}>用于曲库完整度信息</Text>
                {service.type === 'netease' && <Text style={styles.fieldHint}>用于补充专辑曲目和艺人作品信息</Text>}
                {qqUnavailable && <Text style={styles.fieldHint}>QQ 适配尚未接入，此设置暂不会参与查询</Text>}
              </View>
              <Switch value={useMusicInfo} onValueChange={setUseMusicInfo} trackColor={{ false: colors.bgButtonSecondary, true: colors.stateSelected }} thumbColor={colors.textOnAccent} disabled={qqUnavailable} accessibilityLabel="使用此数据源补充曲库完整度信息" />
            </View>}
          </View>

          <Pressable
            style={[styles.actionCard, { marginTop: spacing.md }]}
            disabled={test === 'testing' || Boolean(urlError)}
            onPress={handleTest}
            accessibilityRole="button"
          >
            <Text style={[styles.label, { color: colors.actionText }, (Boolean(urlError) || test === 'testing') && { color: colors.disabledText }]}>
              测试连接
            </Text>
            <Text style={[styles.value, { color: statusColor }]}>{statusText}</Text>
          </Pressable>
          {testMessage ? <Text style={styles.fieldHint}>{testMessage}</Text> : null}

          {mode === 'edit' && (
            <Pressable
              style={[styles.actionCard, { marginTop: spacing.xl, justifyContent: 'center' }]}
              onPress={handleDelete}
              accessibilityRole="button"
            >
              <Text style={[styles.label, { color: colors.danger, textAlign: 'center' }]}>
                删除此数据源
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { padding: spacing.pageMargin, paddingBottom: spacing.md, paddingTop: spacing.md, gap: spacing.sectionGap, flexGrow: 1 },
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl, gap: spacing.md },
  emptyIcon: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  emptyDescription: { ...typography.footnote, color: colors.textTertiary, textAlign: 'center' },
  emptyAddButton: { minHeight: 44, minWidth: 140, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.bgButtonSecondary },
  emptyAddText: { ...typography.callout, color: colors.actionText, fontWeight: '600' },
  grid: {
    flexDirection: 'column',
    gap: spacing.md,
  },
  gridCard: {
    width: '100%',
    minHeight: 120,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    gap: 4,
    flex: 1,
  },
  cardTitle: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardSub: {
    ...typography.footnote,
    color: colors.textTertiary,
  },
  sheetRoot: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  headerBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerBtnText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
    ...typography.headline,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sheetContent: {
    padding: spacing.pageMargin,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  inputSection: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  inputLabel: {
    ...typography.footnote,
    color: colors.textPrimary,
  },
  input: {
    ...typography.callout,
    color: colors.textSecondary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  sectionTitle: { ...typography.callout, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.sm },
  fieldHint: { ...typography.footnote, color: colors.textTertiary, lineHeight: 18 },
  fieldError: { ...typography.footnote, color: colors.danger, lineHeight: 18 },
  switchCopy: { flex: 1, gap: spacing.xs, paddingVertical: spacing.md },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginLeft: spacing.lg,
  },
  label: {
    ...typography.callout,
    color: colors.textPrimary,
  },
  value: {
    ...typography.footnote,
    color: colors.textTertiary,
  },
}))
