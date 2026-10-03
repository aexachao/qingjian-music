import type { ComponentProps } from 'react'
import type { Tabs } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon, type IconName } from '@/components/icon'
import { TAB_BAR_HEIGHT } from '@/lib/bottom-space'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { radius, spacing } from '@/theme/tokens'

const tabIcons: Record<string, IconName> = { home: 'home', search: 'search', library: 'library', settings: 'settings' }
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]
type FloatingTabBarProps = {
  state: Pick<TabBarProps['state'], 'routes' | 'index'>
  descriptors: Record<string, Pick<TabBarProps['descriptors'][string], 'options'>>
  navigation: Pick<TabBarProps['navigation'], 'emit' | 'navigate'>
  insets: Pick<TabBarProps['insets'], 'bottom'>
  hidden: boolean
}

/** 仅替换表面和布局，继续使用 Tabs 的路由、tabPress 和 tabLongPress。 */
export function FloatingTabBar({ state, descriptors, navigation, insets, hidden }: FloatingTabBarProps) {
  const { colors } = useAppTheme()
  const styles = useStyles()
  if (hidden) return null
  return (
    <View style={[styles.shell, { paddingBottom: insets.bottom }]}>
      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const selected = state.index === index
          const options = descriptors[route.key]!.options
          const label = options.title ?? route.name
          const color = selected ? colors.stateSelected : colors.iconDim
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params)
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            >
              <Icon name={tabIcons[route.name] ?? 'home'} size={23} color={color} />
              <Text numberOfLines={1} style={[styles.label, { color }]}>{label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  shell: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: colors.bgFloatingSolid,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.borderEmphasis,
  },
  items: { height: TAB_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: spacing.md, gap: 2 },
  item: { flex: 1, minHeight: 44, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.lg },
  pressed: { opacity: 0.7 },
  label: { fontSize: 10, fontWeight: '600' },
}))
