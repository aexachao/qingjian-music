import { Tabs } from 'expo-router'
import { AuthGate } from '@/lib/auth-gate'
import { Icon, iconSize } from '@/components/icon'
import { MiniPlayerHost } from '@/components/mini-player-host'
import { useThemeColors } from '@/theme/theme-provider'

export default function TabsLayout() {
  const colors = useThemeColors()
  const activeColor = colors.accent
  const inactiveColor = colors.iconDim

  return (
    <AuthGate group="protected">
      <>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: activeColor,
            tabBarInactiveTintColor: inactiveColor,
            tabBarStyle: { backgroundColor: colors.bgPrimary, borderTopColor: colors.borderSubtle },
            sceneStyle: { backgroundColor: colors.bgPrimary },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: '首页',
              tabBarIcon: ({ focused }) => (
                <Icon name="home" color={focused ? activeColor : inactiveColor} size={iconSize.lg} />
              ),
            }}
          />
          <Tabs.Screen
            name="search"
            options={{
              title: '搜索',
              tabBarIcon: ({ focused }) => (
                <Icon name="search" color={focused ? activeColor : inactiveColor} size={iconSize.lg} />
              ),
            }}
          />
          <Tabs.Screen
            name="library"
            options={{
              title: '音乐库',
              tabBarIcon: ({ focused }) => (
                <Icon name="library" color={focused ? activeColor : inactiveColor} size={iconSize.lg} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: '设置',
              tabBarIcon: ({ focused }) => (
                <Icon name="settings" color={focused ? activeColor : inactiveColor} size={iconSize.lg} />
              ),
            }}
          />
        </Tabs>
        <MiniPlayerHost />
      </>
    </AuthGate>
  )
}
