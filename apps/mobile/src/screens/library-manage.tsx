import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { ActionSheet, type ActionSheetItem } from '@/components/action-sheet'
import { useConfirm } from '@/components/confirm-modal'
import { Icon, iconSize } from '@/components/icon'
import { EmptyState, ErrorState, LoadingState } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { hasActiveScan, libraryDisplayName, libraryUpdatedLabel } from '@/lib/scan-progress-policy'
import { useScanMonitor } from '@/lib/use-scan-monitor'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/**
 * 曲库管理（仅 admin，入口在设置页按 isAdmin gate）。
 *
 * 对齐飞牛的形态：
 * - 导航栏右侧「···」→ 扫描所有音乐库（不放「+ 新增库」，我们不做库管理）。
 * - 每张卡片：文件夹图标 + 库名 + 最近更新时间；右侧「···」→ 扫描本库
 *   （目前菜单只有这一条，编辑/删除不做，保留 ··· 形态便于将来扩展）。
 *
 * 扫描进度不在这个页显示 —— 触发后到首页右上角「正在扫描」图标看（见 ScanMonitorButton）。
 */
export function LibraryManageScreen() {
  const styles = useStyles()
  const colors = useThemeColors()
  const confirm = useConfirm()
  const toast = useToast()
  const bottom = useBottomSpace()
  const { provider, me, isAdmin, libraries, tasks } = useScanMonitor()

  // 卡片 ··· 菜单：记住点的是哪个库（null = 关闭）
  const [cardMenuLib, setCardMenuLib] = useState<{ id: string; name: string } | null>(null)
  // 导航栏 ··· 菜单开关
  const [navMenuOpen, setNavMenuOpen] = useState(false)

  /** 扫完触发后轮询几次，把新任务拉进缓存（首页图标即刻感知），再撤本地态 */
  const waitForTask = async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await tasks.refetch()
      if (hasActiveScan(result.data ?? [])) break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  const scanOne = (libraryId: string, name: string) => {
    confirm({
      title: '扫描曲库',
      message: `扫描「${name}」以发现新增或改动的文件。曲库较大时可能需要几分钟。`,
      confirmText: '开始扫描',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await provider!.scanLibrary!(libraryId)
          toast('已开始扫描，可在首页查看进度')
          await waitForTask()
        } catch (error) {
          toast(error instanceof Error ? error.message : '扫描触发失败')
        }
      },
    })
  }

  const scanAll = () => {
    confirm({
      title: '扫描所有音乐库',
      message: '扫描全部音乐库以发现新增或改动的文件。曲库较大时可能需要几分钟。',
      confirmText: '全部扫描',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await provider!.scanAllLibraries!()
          toast('已开始扫描，可在首页查看进度')
          await waitForTask()
        } catch (error) {
          toast(error instanceof Error ? error.message : '扫描触发失败')
        }
      },
    })
  }

  const canScanAll = Boolean(provider?.scanAllLibraries)
  const navMenuItems: ActionSheetItem[] = canScanAll
    ? [{ key: 'scan-all', title: '扫描所有音乐库', icon: 'recentlyPlayed' }]
    : []

  const titleScreen = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: '曲库管理',
        headerLeft: () => <StackBackButton />,
        headerRight: () =>
          isAdmin && navMenuItems.length > 0 ? (
            <Pressable
              onPress={() => setNavMenuOpen(true)}
              hitSlop={12}
              style={styles.navMore}
              accessibilityRole="button"
              accessibilityLabel="更多操作"
            >
              <Icon name="more" size={iconSize.lg} color={colors.textPrimary} />
            </Pressable>
          ) : null,
      }}
    />
  )

  // 等 me 加载完再判，避免闪
  if (me.isPending) {
    return (
      <>
        {titleScreen}
        <LoadingState />
      </>
    )
  }
  if (!isAdmin) {
    return (
      <>
        {titleScreen}
        <EmptyState text="曲库扫描仅管理员可用" />
      </>
    )
  }
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
            const updated = libraryUpdatedLabel(lib.contentLastChangedAt)
            return (
              <View key={lib.id} style={styles.card}>
                <View style={styles.folderIcon}>
                  <Icon name="storage" size={iconSize.lg} color={colors.iconMid} />
                </View>
                <View style={styles.cardInfo}>
                  <Text numberOfLines={1} style={styles.libName}>
                    {name}
                  </Text>
                  <Text numberOfLines={1} style={styles.libMeta}>
                    {updated || lib.path}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setCardMenuLib({ id: lib.id, name })}
                  hitSlop={8}
                  style={({ pressed }) => [styles.cardMore, pressed && styles.cardMorePressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${name} 更多操作`}
                >
                  <Icon name="more" size={iconSize.md} color={colors.textSecondary} />
                </Pressable>
              </View>
            )
          })
        )}

        <Text style={styles.footNote}>
          扫描会在服务器上进行，触发后可在首页右上角查看进度。
        </Text>
      </ScrollView>

      {/* 导航栏「···」：扫描所有音乐库 */}
      <ActionSheet
        visible={navMenuOpen}
        items={navMenuItems}
        onSelect={(key) => {
          if (key === 'scan-all') scanAll()
        }}
        onClose={() => setNavMenuOpen(false)}
      />

      {/* 卡片「···」：扫描本库（只有一条，保留 ··· 形态便于扩展） */}
      <ActionSheet
        visible={cardMenuLib !== null}
        title={cardMenuLib?.name}
        items={[{ key: 'scan', title: '扫描音乐库', icon: 'recentlyPlayed' }]}
        onSelect={(key) => {
          if (key === 'scan' && cardMenuLib) scanOne(cardMenuLib.id, cardMenuLib.name)
        }}
        onClose={() => setCardMenuLib(null)}
      />
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  navMore: { width: 32, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  folderIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.bgListItemSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1, gap: 3 },
  libName: { ...typography.headline, color: colors.textPrimary },
  libMeta: { ...typography.caption, color: colors.textTertiary },
  cardMore: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMorePressed: { backgroundColor: colors.bgListItemHover },
  footNote: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
}))
