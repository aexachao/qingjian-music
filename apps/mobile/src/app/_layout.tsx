import { QueryClientProvider } from '@tanstack/react-query'
import { Stack, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MiniPlayer } from '@/components/mini-player'
import { queryClient } from '@/lib/query-client'
import { ServerSessionProvider } from '@/lib/server-session'
import { PlayerBridge } from '@/player/bridge'
import { colors, spacing } from '@/theme/tokens'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ServerSessionProvider>
            <StatusBar style="light" />
            <PlayerBridge />
            <View style={styles.root}>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.background },
                  headerTintColor: colors.text,
                  headerTitleStyle: { color: colors.text },
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ title: '连接服务器' }} />
                <Stack.Screen name="albums" options={{ title: '专辑' }} />
                <Stack.Screen name="album/[id]" options={{ title: '' }} />
                <Stack.Screen
                  name="player"
                  options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
                />
              </Stack>
              <MiniPlayerSlot />
            </View>
          </ServerSessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/** 迷你条悬浮在内容之上，但正在播放页和登录页不显示 */
function MiniPlayerSlot() {
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  if (pathname === '/player' || pathname === '/login' || pathname === '/') return null
  return (
    <View style={[styles.miniSlot, { bottom: insets.bottom + spacing.sm }]} pointerEvents="box-none">
      <MiniPlayer />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  miniSlot: { position: 'absolute', left: 0, right: 0 },
})
