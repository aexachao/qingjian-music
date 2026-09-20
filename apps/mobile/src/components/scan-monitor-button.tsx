import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BackgroundTask, MusicLibrary } from '@qj/core-domain'
import { Icon, iconSize } from '@/components/icon'
import { useScanMonitor } from '@/lib/use-scan-monitor'
import {
  findScanTask,
  libraryDisplayName,
  scanProgressView,
} from '@/lib/scan-progress-policy'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/**
 * 首页右上角「正在扫描」图标（仅 admin，且仅在有扫描进行时出现）。
 *
 * 对齐飞牛：曲库扫描在设置页触发后，App 任意页都能从首页这个图标看进度。
 * 点它 → 底部弹出进度面板，按音乐库列出，每行显示扫描百分比。
 * 所有扫描结束 → 无活跃扫描 → 组件返回 null，图标消失（面板也随之收起）。
 *
 * 权限边界（甲方案）：非 admin 永远拿不到 isAdmin=true，图标与面板都不出现。
 */
export function ScanMonitorButton() {
  const colors = useThemeColors()
  const { isAdmin, libraries, tasks, active } = useScanMonitor()
  const [open, setOpen] = useState(false)

  // 旋转动画：有活跃扫描时持续转
  const [spin] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (!active) return
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => {
      loop.stop()
      spin.setValue(0)
    }
  }, [active, spin])

  // 扫描结束就收起面板
  useEffect(() => {
    if (!active) setOpen(false)
  }, [active])

  if (!isAdmin || !active) return null

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={12}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="查看曲库扫描进度"
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="recentlyPlayed" size={iconSize.lg} color={colors.brandTint} />
        </Animated.View>
      </Pressable>

      <ScanProgressSheet
        visible={open}
        onClose={() => setOpen(false)}
        libraries={libraries.data ?? []}
        tasks={tasks.data ?? []}
      />
    </>
  )
}

interface ScanProgressSheetProps {
  visible: boolean
  onClose: () => void
  libraries: MusicLibrary[]
  tasks: BackgroundTask[]
}

function ScanProgressSheet({ visible, onClose, libraries, tasks }: ScanProgressSheetProps) {
  const styles = useSheetStyles()
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(visible)
  const closingRef = useRef(false)
  const [anim] = useState(() => new Animated.Value(0))

  useEffect(() => {
    if (visible) {
      closingRef.current = false
      setMounted(true)
      anim.setValue(0)
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    } else if (mounted && !closingRef.current) {
      closingRef.current = true
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        closingRef.current = false
        setMounted(false)
      })
    }
  }, [visible, mounted, anim])

  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      closingRef.current = false
      setMounted(false)
      onClose()
    })
  }

  if (!mounted) return null

  // 只展示当前有扫描任务（正在扫或刚扫完）的库
  const rows = libraries
    .map((lib) => ({ lib, task: findScanTask(tasks, lib.id) }))
    .filter((r) => r.task)

  const backdropStyle = { opacity: anim }
  const sheetStyle = {
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }],
  }

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={close}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="关闭" />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>曲库扫描</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.list} bounces={false}>
            {rows.length === 0 ? (
              <Text style={styles.empty}>暂无进行中的扫描</Text>
            ) : (
              rows.map(({ lib, task }) => {
                const name = libraryDisplayName(lib.name, lib.path)
                const view = scanProgressView(task)
                return (
                  <View key={lib.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <Text numberOfLines={1} style={styles.libName}>
                        {name}
                      </Text>
                      <Text style={styles.percent}>
                        {view.phase === 'done' ? '完成' : `${view.percent}%`}
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${view.percent}%` }]} />
                    </View>
                    <Text numberOfLines={1} style={styles.label}>
                      {view.label}
                    </Text>
                    {view.failedLabel ? (
                      <Text style={styles.failed}>{view.failedLabel}</Text>
                    ) : null}
                  </View>
                )
              })
            )}
          </ScrollView>

          <Text style={styles.foot}>扫描在服务器上进行，可离开此页，进度自动刷新。</Text>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
})

const useSheetStyles = createThemedStyles((colors) => ({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgOverlay },
  sheet: {
    backgroundColor: colors.bgModal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSelected,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  title: {
    ...typography.headline,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  scroll: { maxHeight: 360 },
  list: { gap: spacing.md },
  empty: {
    ...typography.subhead,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  card: {
    backgroundColor: colors.bgListItemSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  libName: { ...typography.headline, color: colors.textPrimary, flex: 1 },
  percent: { ...typography.subhead, fontWeight: '600', color: colors.brandTint, fontVariant: ['tabular-nums'] },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bgListItemHover,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.brandTint },
  label: { ...typography.caption, color: colors.textSecondary },
  failed: { ...typography.caption, color: colors.textTertiary },
  foot: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
}))
