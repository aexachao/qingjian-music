import { useCallback, useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { StackBackButton } from '@/components/stack-back-button'
import { EmptyState } from '@/components/list-states'
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

  const titleScreen = (
    <Stack.Screen
      options={{ headerShown: true, title: '崩溃日志', headerLeft: () => <StackBackButton /> }}
    />
  )

  const onCopyOne = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text)
    toast('已复制这条')
  }, [toast])

  const onShareAll = useCallback(() => {
    void Share.share({ message: formatCrashLogText(logs) })
  }, [logs])

  const onClear = useCallback(() => {
    confirm({
      title: '清空崩溃日志？',
      message: '清空后无法恢复。',
      confirmText: '清空',
      destructive: true,
      onConfirm: () => {
        clearCrashLogs()
        setLogs(readCrashLogs())
      },
    })
  }, [confirm])

  if (logs.length === 0) {
    return (
      <>
        {titleScreen}
        <EmptyState text="暂无崩溃记录" />
      </>
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
          return (
            <View key={`${entry.at}_${i}`} style={styles.card}>
              <Text style={styles.cardText} selectable>
                {text}
              </Text>
              <Pressable
                onPress={() => void onCopyOne(text)}
                hitSlop={8}
                style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="复制这条崩溃日志"
              >
                <Text style={styles.copyBtnText}>复制这条</Text>
              </Pressable>
            </View>
          )
        })}

        <Text style={styles.note}>
          仅记录 App 内 JS 层崩溃。若点开就闪退、这里也没有记录，多半是原生层崩溃，需要系统崩溃报告。
        </Text>
      </ScrollView>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...typography.subhead, color: colors.textSecondary },
  toolbarActions: { flexDirection: 'row', gap: spacing.lg },
  toolBtn: { paddingVertical: spacing.xs },
  toolBtnText: { ...typography.callout, color: colors.brandTint },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardText: { ...typography.caption, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  copyBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnPressed: { opacity: 0.7 },
  copyBtnText: { ...typography.caption, fontWeight: '600', color: colors.textPrimary },
  note: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
}))
