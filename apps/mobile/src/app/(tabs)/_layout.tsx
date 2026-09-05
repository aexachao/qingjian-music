import { Tabs } from 'expo-router'
import { Icon, iconSize } from '@/components/icon'
import { colors } from '@/theme/tokens'

/**
 * 选中/未选中的颜色，文字和图标共用一份。
 * 图标不接 Tabs 回传的 color：那个是 RN 的 ColorValue，而 Icon 只收字符串色值。
 */
const TAB_ACTIVE_COLOR = colors.accent
const TAB_INACTIVE_COLOR = colors.iconDim

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_ACTIVE_COLOR,
        tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
        tabBarStyle: { backgroundColor: colors.bgPrimary, borderTopColor: colors.borderSubtle },
        // 底色根布局的导航主题已经给了深色，这里再写一遍是保险：
        // 没有自带背景的屏一旦漏了底色，露出来的就是白底，很显眼
        sceneStyle: { backgroundColor: colors.bgPrimary },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: '首页',
          tabBarIcon: ({ focused }) => (
            <Icon name="home" color={focused ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR} size={iconSize.lg} />
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
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ focused }) => (
            <Icon name="settings" color={focused ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR} size={iconSize.lg} />
          ),
        }}
      />
    </Tabs>
  )
}
