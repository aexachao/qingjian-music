import { useCallback, useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { StackBackButton } from '@/components/stack-back-button'
import { Icon } from '@/components/icon'
import { useConfirm } from '@/components/confirm-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { clearCrashLogs, readCrashLogs } from '@/lib/crash-log-store'
import { formatCrashEntryText, formatCrashLogText } from '@/lib/crash-log'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/**
 * 崩溃日志查看页（设置 → 崩溃日志）。
 * 只收 JS 层崩溃（与错误屏同源）；落盘后崩溃即使把 App 关了、重开也还在。
 * 提供「复制这条 / 分享全部 / 清空」，方便测试人员把崩溃信息发回来。
 */
export function CrashLogScreen() {
  const styles = useStyles()
  const colors = useThemeColors()
  const bottom = useBottomSpace()
  const confirm = useConfirm()
  const toast = useToast()
  // 崩溃日志只在启动/崩溃时变，进页读一次；清空后重读
  const [logs, setLogs] = useState(() => readCrashLogs())
  const [expanded, setExpanded] = useState<string[]>([])

  const titleScreen = (
    <Stack.Screen
      options={{ headerShown: true, title: '崩溃日志', headerLeft: () => <StackBackButton /> }}
    />
  )

  const onCopyOne = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text)
      toast('已复制日志')
    } catch {
      toast('未能复制，请重试')
    }
  }, [toast])

  const onShareAll = useCallback(() => {
    void Share.share({ message: formatCrashLogText(logs) }).catch(() => toast('未能打开分享，请重试'))
  }, [logs, toast])

  const onClear = useCallback(() => {
    confirm({
      title: '清空崩溃日志？',
      message: '清空后无法恢复。',
      confirmText: '清空',
      destructive: true,
      onConfirm: () => {
        clearCrashLogs()
        const remaining = readCrashLogs()
        setLogs(remaining)
        if (remaining.length > 0) toast('未能清空日志，请重试')
      },
    })
  }, [confirm, toast])

  if (logs.length === 0) {
    return (
      <View style={styles.root}>
        {titleScreen}
        <View style={[styles.empty, { paddingBottom: bottom + spacing.xl }]}>
          <Icon name="document" size={32} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>暂无崩溃记录</Text>
          <Text style={styles.emptyText}>如果遇到异常，可在这里查看并分享诊断信息。</Text>
        </View>
      </View>
    )
  }

  // 最近的在最上
  const ordered = [...logs].reverse()

  return (
    <View style={styles.root}>
      {titleScreen}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.xl }]}>
        <View style={styles.toolbar}>
          <Text style={styles.count}>共 {logs.length} 条</Text>
          <View style={styles.toolbarActions}>
            <Pressable onPress={onShareAll} hitSlop={8} style={styles.toolBtn} accessibilityRole="button" accessibilityLabel="分享全部崩溃日志">
              <Text style={styles.toolBtnText}>分享全部</Text>
            </Pressable>
            <Pressable onPress={onClear} hitSlop={8} style={styles.toolBtn} accessibilityRole="button" accessibilityLabel="清空崩溃日志">
              <Text style={[styles.toolBtnText, { color: colors.danger }]}>清空</Text>
            </Pressable>
          </View>
        </View>

        {ordered.map((entry, i) => {
          const text = formatCrashEntryText(entry)
          const key = `${entry.at}_${i}`
          const isExpanded = expanded.includes(key)
          return (
            <View key={key} style={styles.card}>
              <Text style={styles.cardMeta}>{new Date(entry.at).toLocaleString('zh-CN', { hour12: false })}</Text>
              <Text style={styles.cardTitle} selectable>{entry.message}</Text>
              <Text style={styles.cardMeta}>
                {entry.source === 'render' ? '界面异常' : '运行异常'}
                {entry.appVersion ? ` · ${entry.appVersion}` : ''}
                {entry.buildNumber ? ` (${entry.buildNumber})` : ''}
              </Text>
              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => setExpanded((current) => isExpanded ? current.filter((item) => item !== key) : [...current, key])}
                  style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  accessibilityLabel={isExpanded ? '收起日志详情' : '查看日志详情'}
                >
                  <Text style={styles.copyBtnText}>{isExpanded ? '收起详情' : '查看详情'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void onCopyOne(text)}
                  style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="复制这条崩溃日志"
                >
                  <Text style={styles.copyBtnText}>复制日志</Text>
                </Pressable>
              </View>
              {isExpanded ? <Text style={styles.cardText} selectable>{text}</Text> : null}
            </View>
          )
        })}

        <Text style={styles.note}>
          这里保留应用内的异常记录，方便反馈问题。若启动即闪退且没有记录，可通过 TestFlight 提交系统崩溃报告。
        </Text>
      </ScrollView>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between' },
  count: { ...typography.subhead, color: colors.textSecondary },
  toolbarActions: { flexDirection: 'row', gap: spacing.lg },
  toolBtn: { minHeight: 44, paddingVertical: spacing.sm, justifyContent: 'center' },
  toolBtnText: { ...typography.callout, color: colors.textPrimary },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.callout, fontWeight: '600', color: colors.textPrimary },
  cardMeta: { ...typography.footnote, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  cardText: { ...typography.footnote, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  copyBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgButtonSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnPressed: { opacity: 0.7 },
  copyBtnText: { ...typography.footnote, fontWeight: '600', color: colors.textPrimary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyTitle: { ...typography.headline, color: colors.textPrimary },
  emptyText: { ...typography.footnote, color: colors.textTertiary, textAlign: 'center' },
  note: {
    ...typography.footnote,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
}))
