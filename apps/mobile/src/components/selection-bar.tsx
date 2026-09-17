import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon, iconSize, type IconName } from '@/components/icon'
import { SELECT_ALL_LABEL, type SelectionState } from '@/lib/selection-policy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

/**
 * 选择态（多选）的两条栏：
 *   · `SelectionToolbarBar` 顶替原来的「计数 + 排序」工具条（就在导航栏下方、不随列表滚走）；
 *   · `SelectionActionBar` 贴着底部悬浮（让开 Tab 栏与迷你播放条），批量动作都在这里。
 *
 * 文案与「已选/全选」的判定在 `lib/selection-policy.ts`（纯逻辑，有单测），这里只管渲染。
 */

/** 底部动作栏高度：列表要在底部多让出这么多，否则最后几行被盖住 */
export const SELECTION_ACTION_BAR_HEIGHT = 64

/** 三态图标：未选（空心圆）/ 半选（实心带横线）/ 全选（实心带勾） */
const STATE_ICON: Record<SelectionState, IconName> = {
  none: 'circle',
  partial: 'circleIndeterminate',
  all: 'checkmarkCircle',
}

export interface SelectionToolbarBarProps {
  state: SelectionState
  /** 已选数量文案（`3 首`）；没有选中时不渲染 */
  countText: string
  onToggleAll: () => void
  onDone: () => void
}

export function SelectionToolbarBar({ state, countText, onToggleAll, onDone }: SelectionToolbarBarProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const selected = state !== 'none'

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <Pressable
          onPress={onToggleAll}
          hitSlop={8}
          style={styles.selectAll}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: state === 'partial' ? 'mixed' : state === 'all' }}
          accessibilityLabel={SELECT_ALL_LABEL}
        >
          <Icon
            name={STATE_ICON[state]}
            size={22}
            color={selected ? colors.stateSelected : colors.textTertiary}
          />
          <Text style={styles.label}>{SELECT_ALL_LABEL}</Text>
        </Pressable>

        {/* 选了多少首：紧跟在「全选」右侧，不写「已选/已加载」 */}
        {selected ? <Text style={styles.count}>{countText}</Text> : null}
      </View>

      <Pressable onPress={onDone} hitSlop={8} accessibilityRole="button" accessibilityLabel="完成">
        <Text style={styles.done}>完成</Text>
      </Pressable>
    </View>
  )
}

export interface SelectionActionBarProps {
  /** 选中数量：为 0 时整条动作栏不可点（也不该给假反馈） */
  count: number
  onPlay: () => void
  onAppend: () => void
  onAddToPlaylist: () => void
  /** 下载（第 7 轮接上）：批量下载选中曲目 */
  onDownload: () => void
}

export function SelectionActionBar({
  count,
  onPlay,
  onAppend,
  onAddToPlaylist,
  onDownload,
}: SelectionActionBarProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  // 动作栏在**模态**里（弹窗盖住了 Tab 栏与迷你播放条）。背景要一直铺到屏幕最底边
  // （小横条下面也是它），所以用 paddingBottom 让开安全区，而不是整体往上挪。
  const insets = useSafeAreaInsets()
  const disabled = count === 0

  const items: { key: string; label: string; icon: IconName; enabled: boolean; onPress: () => void }[] = [
    { key: 'play', label: '播放', icon: 'play', enabled: !disabled, onPress: onPlay },
    { key: 'queue', label: '加入播放列表', icon: 'queue', enabled: !disabled, onPress: onAppend },
    { key: 'download', label: '下载', icon: 'download', enabled: !disabled, onPress: onDownload },
    { key: 'playlist', label: '添加到歌单', icon: 'importPlaylist', enabled: !disabled, onPress: onAddToPlaylist },
  ]

  return (
    <View style={[styles.actionBar, { paddingBottom: insets.bottom }]}>
      <View style={styles.actionRow}>
        {items.map((item) => {
        // 动作栏用中性色：整条都染品牌红太吵（2026-09-15 你提的，全局配色规范另开一轮）
        const tint = item.enabled ? colors.textPrimary : colors.textQuaternary
        return (
          <Pressable
            key={item.key}
            style={styles.action}
            onPress={() => item.enabled && item.onPress()}
            disabled={!item.enabled}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ disabled: !item.enabled }}
          >
            <Icon name={item.icon} size={iconSize.lg} color={tint} />
            <Text style={[styles.actionLabel, { color: tint }]}>{item.label}</Text>
          </Pressable>
        )
        })}
      </View>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...typography.subhead, color: colors.textPrimary },
  count: { ...typography.subhead, color: colors.textTertiary },
  done: { ...typography.subhead, color: colors.primaryAction, fontWeight: '600' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // 背景铺到屏幕最底边（含小横条下面），按钮行只占上面 64
    backgroundColor: colors.bgFloatingSolid,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderEmphasis,
  },
  actionRow: {
    height: SELECTION_ACTION_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 },
  actionLabel: { ...typography.caption, fontSize: 11 },
}))
