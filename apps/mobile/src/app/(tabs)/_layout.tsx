import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MiniPlayer } from '@/components/mini-player'
import { colors, spacing } from '@/theme/tokens'

/** iOS 标准 Tab 栏高度，迷你条要贴在它上面 */
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56

export default function TabsLayout() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: 'rgba(235,235,245,0.08)' },
        }}
      >
        <Tabs.Screen
          name="library"
          options={{
            title: '资料库',
            tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: '搜索',
            tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: '设置',
            tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
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
  root: { flex: 1, backgroundColor: colors.background },
  mini: { position: 'absolute', left: 0, right: 0 },
})
