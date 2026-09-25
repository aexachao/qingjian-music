import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native'
import { createThemedStyles } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/**
 * 通用分段控件（搜索结果页签用的就是它）。
 *
 * 仓库里此前没有这种东西 —— `(tabs)/_layout.tsx` 那个是路由级 tabBar，不是一个能放在
 * 页面里的组件。样式走 design token：未选中是次要文字，选中是强调色 + 下方一条强调色指示条。
 * 页签多到放不下时可以横向滚动（所以我们不用 iOS 的 UISegmentedControl，
 * 那个会把标题挤成省略号）。
 */
export interface SegmentedTabItem<T extends string = string> {
  key: T
  label: string
}

export interface SegmentedTabsProps<T extends string = string> {
  items: readonly SegmentedTabItem<T>[]
  value: T
  onChange: (key: T) => void
  /** 无障碍：整条控件的名字，例如「搜索结果分类」 */
  accessibilityLabel?: string
  /** 是否居中显示页签（页签较少时居中对齐） */
  center?: boolean
}

export function SegmentedTabs<T extends string = string>({
  items,
  value,
  onChange,
  accessibilityLabel,
  center,
}: SegmentedTabsProps<T>) {
  const styles = useStyles()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, center && styles.rowCenter]}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={accessibilityLabel}
    >
      {items.map((item) => {
        const selected = item.key === value
        return (
          <Pressable
            key={item.key}
            style={styles.item}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
            <View style={[styles.indicator, selected && styles.indicatorSelected]} />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const useStyles = createThemedStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  rowCenter: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  item: {
    paddingTop: spacing.sm,
    gap: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
  },
  label: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  labelSelected: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  indicator: {
    height: 2,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  indicatorSelected: {
    backgroundColor: colors.textPrimary,
  },
  // 让指示条在未选中时也占位，避免整行高度抖动
  hairline: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
}))
