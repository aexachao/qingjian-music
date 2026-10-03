import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useServerSession } from '@/lib/server-session'
import { useBottomSpace } from '@/lib/bottom-space'
import { useConfirm } from '@/components/confirm-modal'
import { useToast } from '@/components/toast'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export function ServerRoutesScreen() {
  const { connection, provider, saveServerRoutes } = useServerSession()
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const toast = useToast()
  const confirm = useConfirm()
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const routing = provider?.routing
  const subscribe = useCallback((listener: () => void) => routing?.subscribe(listener) ?? (() => undefined), [routing])
  const snapshot = useCallback(() => routing?.getActiveBaseUrl() ?? connection?.baseUrl ?? '', [connection?.baseUrl, routing])
  const active = useSyncExternalStore(subscribe, snapshot, snapshot)
  const alternates = connection?.alternateBaseUrls ?? []

  const save = async (urls: string[], added = false) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await saveServerRoutes(urls)
      if (added) setAddress('')
      toast(added ? '备用线路已验证并添加' : '备用线路已删除')
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存线路失败，请重试')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  if (!connection || !routing) return <View style={styles.screen}><Text style={styles.unavailable}>当前服务器暂不支持多线路设置。</Text></View>
  const routes = [connection.baseUrl, ...alternates]
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.sectionHeading}>
          <Text style={styles.heading}>连接线路</Text>
          <Text style={styles.footer}>当前连接：{connection.displayName}</Text>
        </View>
        <View style={styles.card}>
          {routes.map((url, index) => (
            <View key={url} style={[styles.row, index > 0 && styles.divider]}>
              <View style={styles.routeText}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{index === 0 ? '主线路' : `备用线路 ${index}`}</Text>
                  {active === url && <Text style={styles.active}>当前连接</Text>}
                </View>
                <Text selectable style={styles.address}>{url}</Text>
              </View>
              {index > 0 && <Pressable
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`删除备用线路 ${index}`}
                accessibilityState={{ disabled: busy }}
                style={styles.removeButton}
                onPress={() => confirm({ title: '删除备用线路', message: `确定移除 ${url} 吗？${active === url ? '后续请求将使用剩余线路。' : ''}`, confirmText: '删除', destructive: true, onConfirm: () => save(alternates.filter((item) => item !== url)) })}
              ><Text style={[styles.removeText, busy && styles.disabled]}>删除</Text></Pressable>}
            </View>
          ))}
        </View>
        {alternates.length < 2 && <View style={styles.card}>
          <View style={styles.inputSection}>
            <Text style={styles.title}>添加线路</Text>
            <TextInput
              value={address} onChangeText={setAddress} editable={!busy}
              placeholder="https://music.example.com" placeholderTextColor={colors.textTertiary}
              keyboardType="url" autoCapitalize="none" autoCorrect={false}
              accessibilityLabel="备用线路地址" returnKeyType="done"
              style={styles.input} onSubmitEditing={() => { if (address.trim()) void save([...alternates, address], true) }}
            />
            <Pressable
              onPress={() => void save([...alternates, address], true)} disabled={busy || !address.trim()}
              accessibilityRole="button" accessibilityLabel="验证并添加备用线路"
              accessibilityState={{ disabled: busy || !address.trim(), busy }}
              style={[styles.addButton, (busy || !address.trim()) && styles.buttonDisabled]}
            >
              {busy ? <ActivityIndicator color={colors.loadingIndicator} /> : <Text style={[styles.addText, (busy || !address.trim()) && styles.addTextDisabled]}>验证并添加</Text>}
            </Pressable>
          </View>
        </View>}
        <Text style={styles.footer}>最多三条线路，需指向同一台服务器。地址验证通过后才会保存。</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.pageMargin, gap: spacing.sectionGap },
  sectionHeading: { gap: spacing.xs },
  heading: { ...typography.sectionTitle, color: colors.textPrimary },
  footer: { ...typography.footnote, color: colors.textTertiary, lineHeight: 21 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, overflow: 'hidden' },
  row: { padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeText: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.callout, color: colors.textPrimary, fontWeight: '600' },
  active: { ...typography.caption, color: colors.stateSelected },
  address: { ...typography.footnote, color: colors.textSecondary },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  removeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { ...typography.callout, color: colors.danger },
  disabled: { color: colors.disabledText },
  inputSection: { padding: spacing.md, gap: spacing.md },
  input: { ...typography.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: spacing.md, minHeight: 48 },
  addButton: { backgroundColor: colors.primaryAction, borderRadius: radius.md, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { backgroundColor: colors.bgButtonSecondary },
  addText: { ...typography.callout, fontWeight: '600', color: colors.textOnAccent },
  addTextDisabled: { color: colors.disabledText },
  unavailable: { ...typography.footnote, color: colors.textTertiary, padding: spacing.pageMargin },
}))
