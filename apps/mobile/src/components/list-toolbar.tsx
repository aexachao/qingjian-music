import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { SortSpec } from '@qj/core-domain'
import { Icon, iconSize } from '@/components/icon'
import { ListSortMenu, type MenuAnchor } from '@/components/list-sort-menu'
import {
  canSort,
  countText,
  defaultSortSelection,
  sortFieldLabel,
  sortSpecFor,
  type ListKind,
  type SortSelection,
} from '@/lib/list-sort-policy'
import { formatPlayableDurationText } from '@/lib/playlist-meta'
import { tap } from '@/lib/haptics'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

/**
 * 列表排序状态。**不记住**：每次进页面回默认（= 服务端默认方向，首屏顺序和以前一致）。
 * 排序字段本身的定义在 `list-sort-policy.ts`（纯逻辑，有单测），这里只管界面状态。
 */
export function useListSort(kind: ListKind): {
  selection: SortSelection | undefined
  setSelection: (selection: SortSelection) => void
  /** 进 queryKey 用；不排序时是空串 */
  sortKey: string
  sort: SortSpec | undefined
} {
  const [selection, setSelection] = useState<SortSelection | undefined>(() => defaultSortSelection(kind))
  return {
    selection,
    setSelection,
    sortKey: selection ? `${selection.field}:${selection.order}` : '',
    sort: sortSpecFor(kind, selection),
  }
}

interface ListToolbarProps {
  kind: ListKind
  /** 分页查询给的 total —— 不是已加载条数 */
  total: number
  selection: SortSelection | undefined
  onSelect: (selection: SortSelection) => void
  /** 传了它就多一颗「批量选择」入口（在排序图标左侧） */
  onStartSelection?: () => void
  /** 可选：总时长毫秒数，若传入则在计数后追加展示「 · 可播 xx 分钟」 */
  totalDurationMs?: number
}

/**
 * 列表工具条：左「共 X 首」，右排序按钮。
 * `total` 为 0 时整条不渲染（空列表计数没有意义，交给空态文案）。
 * 服务端不支持排序、或只有一个可排字段时，只显示计数、不摆按钮。
 *
 * 点排序按钮弹出的是**贴着按钮的快捷菜单**（ListSortMenu），不是底部弹窗：
 * 位置靠按钮的 measureInWindow 结果算出来。
 *
 * 间距由外面包一层控制（列表页固定条 / 详情页头部），这里只负责这一行。
 */
export function ListToolbar({ kind, total, selection, onSelect, onStartSelection, totalDurationMs }: ListToolbarProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const buttonRef = useRef<View>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null)
  const currentLabel = selection ? sortFieldLabel(kind, selection.field) : undefined

  if (total <= 0) return null

  const baseCount = countText(kind, total)
  const playable = totalDurationMs ? formatPlayableDurationText(totalDurationMs) : ''
  const displayCount = playable ? `${baseCount} · ${playable}` : baseCount

  const openMenu = () => {
    // 先量出按钮在窗口里的位置，菜单才能贴着它弹（底部弹窗换成快捷菜单的关键一步）
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setMenuOpen(true)
    })
  }

  return (
    <View style={styles.bar}>
      <Text style={styles.count}>{displayCount}</Text>

      <View style={styles.actions}>
        {onStartSelection ? (
          <Pressable
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 6 }}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={() => {
              tap()
              onStartSelection()
            }}
            accessibilityRole="button"
            accessibilityLabel="批量选择"
          >
            <Icon name="select" size={iconSize.md} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {canSort(kind) ? (
          <Pressable
            ref={buttonRef}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel={currentLabel ? `排序，当前按${currentLabel}` : '排序'}
          >
            <Icon
              name="sort"
              size={iconSize.md}
              color={menuOpen ? colors.textPrimary : colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      <ListSortMenu
        visible={menuOpen}
        anchor={anchor}
        kind={kind}
        selection={selection}
        onSelect={onSelect}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  bar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  count: { ...typography.caption, color: colors.textTertiary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  actionButtonPressed: {
    opacity: 0.6,
  },
}))

/**
 * 固定在导航栏下方的工具条（列表页用）：计数与排序不随列表滚走。
 * 计数为 0 时整条不渲染。
 */
export function ListToolbarBar(props: ListToolbarProps) {
  const styles = useBarStyles()
  if (props.total <= 0) return null
  return (
    <View style={styles.bar}>
      <ListToolbar {...props} />
    </View>
  )
}

const useBarStyles = createThemedStyles((colors) => ({
  bar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
}))
