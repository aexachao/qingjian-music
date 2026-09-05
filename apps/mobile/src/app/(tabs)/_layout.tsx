import { Tabs } from 'expo-router'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, iconSize } from '@/components/icon'
import { MiniPlayer } from '@/components/mini-player'
import { colors, spacing } from '@/theme/tokens'

/** iOS 标准 Tab 栏高度，迷你条要贴在它上面 */
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56

/**
 * 选中/未选中的颜色，文字和图标共用一份。
 * 图标不接 Tabs 回传的 color：那个是 RN 的 ColorValue，而 Icon 只收字符串色值。
 */
const TAB_ACTIVE_COLOR = colors.accent
const TAB_INACTIVE_COLOR = colors.iconDim

export default function TabsLayout() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: TAB_ACTIVE_COLOR,
          tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
          tabBarStyle: { backgroundColor: colors.bgPrimary, borderTopColor: colors.borderSubtle },
        }}
      >
        <Tabs.Screen
          name="library"
          options={{
            title: '资料库',
            // 尺寸固定 lg（24），不用 Tabs 给的 size
            tabBarIcon: ({ focused }) => (
              <Icon name="library" color={focused ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR} size={iconSize.lg} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: '搜索',
            tabBarIcon: ({ focused }) => (
              <Icon name="search" color={focused ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR} size={iconSize.lg} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: '设置',
            tabBarIcon: ({ focused }) => (
              <Icon name="settings" color={focused ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR} size={iconSize.lg} />
            ),
          }}
        />
      </Tabs>
      <View style={[styles.mini, { bottom: insets.bottom + TAB_BAR_HEIGHT + spacing.xs }]} pointerEvents="box-none">
        <MiniPlayer />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  mini: { position: 'absolute', left: 0, right: 0 },
})
