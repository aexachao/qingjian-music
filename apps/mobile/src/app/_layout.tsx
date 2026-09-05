import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '@/lib/query-client'
import { ServerSessionProvider } from '@/lib/server-session'
import { PlayerBridge } from '@/player/bridge'
import { colors } from '@/theme/tokens'

// Montserrat 由 expo-font 配置插件在构建期嵌入（见 app.json），启动即可用，无需运行时加载
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ServerSessionProvider>
            <StatusBar style="light" />
            <PlayerBridge />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bgPrimary },
                headerTintColor: colors.textPrimary,
                contentStyle: { backgroundColor: colors.bgPrimary },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ title: '连接服务器' }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="player"
                options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="queue"
                options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="dev-smoke" options={{ title: '自检' }} />
            </Stack>
          </ServerSessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
})
