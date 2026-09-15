import { useEffect, useState } from 'react'
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon, iconSize } from '@/components/icon'
import { tap } from '@/lib/haptics'
import {
  applySortMenuTap,
  sortMenuItems,
  type ListKind,
  type SortMenuItem,
  type SortSelection,
} from '@/lib/list-sort-policy'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/**
 * 排序**快捷菜单**：贴着排序按钮弹出的浮动小卡片（不是底部弹窗）。
 *
 * 一个字段一行，右侧一颗箭头表示这一行代表的方向（↑ 升序 / ↓ 降序）。
 * 点一下就**收起**（和系统快捷菜单一致）：点当前那一行 = 翻方向（见 list-sort-policy.ts
 * 的 applySortMenuTap），要再翻或换字段就再点开菜单选一次。
 * 所以「升序/降序」是一个选项，不是两个。
 *
 * 位置靠 `anchor`（按钮的 measureInWindow 结果）算：默认贴按钮下方右对齐，
 * 下面放不下就翻到按钮上方。点空白处关闭。
 */

/** 排序按钮在窗口里的位置，由 ListToolbar 量出来传进来 */
export interface MenuAnchor {
  x: number
  y: number
  width: number
  height: number
}

export interface ListSortMenuProps {
  visible: boolean
  anchor: MenuAnchor | null
  kind: ListKind
  selection: SortSelection | undefined
  onSelect: (selection: SortSelection) => void
  onClose: () => void
}

const SCREEN_WIDTH = Dimensions.get('window').width
const SCREEN_HEIGHT = Dimensions.get('window').height
const MENU_WIDTH = 184
const MENU_GAP = 6
const ROW_HEIGHT = 44
const MENU_PADDING = spacing.xs
const EDGE_MARGIN = spacing.md

export function ListSortMenu({ visible, anchor, kind, selection, onSelect, onClose }: ListSortMenuProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  // 用 state 持有动画值（不是 ref）：这个组件在 render 里就要读它算样式
  const [anim] = useState(() => new Animated.Value(0))

  useEffect(() => {
    if (!visible) return
    anim.setValue(0)
    Animated.timing(anim, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [visible, anim])

  if (!visible) return null

  const items = sortMenuItems(kind, selection)

  /** 点一行：应用排序并**收起菜单**（要让方向再翻一次，就再点开菜单选同一行） */
  const selectItem = (item: SortMenuItem) => {
    tap()
    onSelect(applySortMenuTap(kind, selection, item.field) ?? { field: item.field, order: item.order })
    onClose()
  }
  const height = items.length * ROW_HEIGHT + MENU_PADDING * 2
  const y = anchor?.y ?? 0
  const buttonBottom = anchor ? anchor.y + anchor.height : 0
  const right = anchor ? Math.max(EDGE_MARGIN, SCREEN_WIDTH - (anchor.x + anchor.width)) : EDGE_MARGIN
  const fitsBelow = buttonBottom + MENU_GAP + height + EDGE_MARGIN <= SCREEN_HEIGHT
  const top = anchor
    ? fitsBelow
      ? buttonBottom + MENU_GAP
      : Math.max(EDGE_MARGIN, y - MENU_GAP - height)
    : EDGE_MARGIN

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭排序菜单" />

        <Animated.View
          style={[
            styles.card,
            { top, right, width: MENU_WIDTH },
            {
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
          accessibilityRole="menu"
        >
          {items.map((item) => (
            <Pressable
              key={item.field}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => selectItem(item)}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: item.active }}
              accessibilityLabel={`${item.label}${item.arrow === 'up' ? '升序' : '降序'}`}
            >
              <Text style={[styles.label, item.active && styles.labelActive]}>{item.label}</Text>
              <Icon
                name={item.arrow === 'up' ? 'arrowUp' : 'arrowDown'}
                size={iconSize.sm}
                color={item.active ? colors.stateSelected : colors.textTertiary}
              />
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </Modal>
  )
}

const useStyles = createThemedStyles((colors) => ({
  overlay: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    paddingVertical: MENU_PADDING,
    borderRadius: radius.lg,
    backgroundColor: colors.bgModal,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.bgListItemHover,
  },
  label: {
    ...typography.callout,
    color: colors.textPrimary,
  },
  labelActive: {
    color: colors.stateSelected,
    fontWeight: '600',
  },
}))
