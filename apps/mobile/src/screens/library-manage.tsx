import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useConfirm } from '@/components/confirm-modal'
import { Icon, iconSize } from '@/components/icon'
import { EmptyState, ErrorState, LoadingState } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useServerSession } from '@/lib/server-session'
import {
  findScanTask,
  hasActiveScan,
  libraryDisplayName,
  scanProgressView,
} from '@/lib/scan-progress-policy'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/** 轮询间隔：只在有扫描任务在跑时用（见下方 refetchInterval） */
const POLL_MS = 2500

/**
 * 曲库管理（仅 admin 可见，入口在设置页按 isAdmin gate）。
 * 列出音乐库 + 触发扫描 + 显示扫描进度。取消/重试/删除任务本轮不做。
 */
export function LibraryManageScreen() {
  const styles = useStyles()
  const colors = useThemeColors()
  const { provider, connection } = useServerSession()
  const confirm = useConfirm()
  const toast = useToast()
  const bottom = useBottomSpace()
  const [scanning, setScanning] = useState<string | null>(null)

  const libraries = useQuery({
    queryKey: ['music-libraries', connection?.id],
    enabled: Boolean(provider?.musicLibraries),
    queryFn: () => provider!.musicLibraries!(),
  })

  const tasks = useQuery({
    queryKey: ['background-tasks', connection?.id],
    enabled: Boolean(provider?.backgroundTasks),
    queryFn: () => provider!.backgroundTasks!(),
    // 有扫描在跑才轮询；空闲时停（不可见时 RN Query 也会自动停）
    refetchInterval: (query) =>
      hasActiveScan(query.state.data ?? []) || scanning ? POLL_MS : false,
  })

  const triggerScan = (libraryId: string, name: string) => {
    confirm({
      title: '扫描曲库',
      message: `扫描「${name}」以发现新增或改动的文件。曲库较大时可能需要几分钟。`,
      confirmText: '开始扫描',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          setScanning(libraryId)
          await provider!.scanLibrary!(libraryId)
          toast('已开始扫描')
          // 轮询几次直到任务出现，再撤掉本地「启动中」态（交给任务列表驱动进度）
          for (let attempt = 0; attempt < 6; attempt += 1) {
            const result = await tasks.refetch()
            if (hasActiveScan(result.data ?? [])) break
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
          setScanning(null)
        } catch (error) {
          setScanning(null)
          toast(error instanceof Error ? error.message : '扫描触发失败')
        }
      },
    })
  }

  const titleScreen = (
    <Stack.Screen
      options={{ headerShown: true, title: '曲库管理', headerLeft: () => <StackBackButton /> }}
    />
  )

  if (libraries.isPending) {
    return (
      <>
        {titleScreen}
        <LoadingState />
      </>
    )
  }
  if (libraries.isLoadingError) {
    return (
      <>
        {titleScreen}
        <ErrorState error={libraries.error} onRetry={() => void libraries.refetch()} />
      </>
    )
  }

  const items = libraries.data ?? []

  return (
    <View style={styles.root}>
      {titleScreen}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.xl }]}>
        {items.length === 0 ? (
          <EmptyState text="没有音乐库" />
        ) : (
          items.map((lib) => {
            const name = libraryDisplayName(lib.name, lib.path)
            const task = findScanTask(tasks.data ?? [], lib.id)
            const view = scanProgressView(task)
            const busy = view.phase === 'scanning' || view.phase === 'finalizing' || scanning === lib.id

            return (
              <View key={lib.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardInfo}>
                    <Text numberOfLines={1} style={styles.libName}>
                      {name}
                    </Text>
                    <Text numberOfLines={1} style={styles.libPath}>
                      {lib.path}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => triggerScan(lib.id, name)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.scanBtn,
                      busy && styles.scanBtnDisabled,
                      pressed && !busy && styles.scanBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`扫描 ${name}`}
                    accessibilityState={{ disabled: busy }}
                  >
                    <Icon
                      name="recentlyPlayed"
                      size={iconSize.sm}
                      color={busy ? colors.disabledText : colors.textPrimary}
                    />
                    <Text style={[styles.scanBtnText, busy && styles.scanBtnTextDisabled]}>
                      {busy ? '扫描中' : '扫描'}
                    </Text>
                  </Pressable>
                </View>

                {view.phase !== 'idle' && (scanning === lib.id || task) ? (
                  <View style={styles.progress}>
                    <Text style={styles.progressLabel}>
                      {scanning === lib.id && !task ? '正在启动扫描…' : view.label}
                    </Text>
                    {view.failedLabel ? (
                      <Text style={styles.progressFailed}>{view.failedLabel}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )
          })
        )}

        <Text style={styles.footNote}>
          扫描会在服务器上进行，App 可以离开此页。进度会自动刷新。
        </Text>
      </ScrollView>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardInfo: { flex: 1, gap: 2 },
  libName: { ...typography.headline, color: colors.textPrimary },
  libPath: { ...typography.caption, color: colors.textTertiary },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
  },
  scanBtnPressed: { opacity: 0.75 },
  scanBtnDisabled: { opacity: 0.6 },
  scanBtnText: { ...typography.subhead, fontWeight: '600', color: colors.textPrimary },
  scanBtnTextDisabled: { color: colors.disabledText },
  progress: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
    gap: 2,
  },
  progressLabel: { ...typography.subhead, color: colors.textSecondary },
  progressFailed: { ...typography.caption, color: colors.textTertiary },
  footNote: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
}))
