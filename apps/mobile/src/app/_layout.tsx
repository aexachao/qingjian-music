import { QueryClientProvider } from '@tanstack/react-query'
import { Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ToastProvider } from '@/components/toast'
import { queryClient } from '@/lib/query-client'
import { ServerSessionProvider } from '@/lib/server-session'
import { navigationTheme, stackScreenOptions } from '@/lib/stack-options'
import { PlayerBridge } from '@/player/bridge'
import { colors } from '@/theme/tokens'

// Montserrat 由 expo-font 配置插件在构建期嵌入（见 app.json），启动即可用，无需运行时加载
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* 导航主题统一给深色底：导航栏、Tab 栏、页面场景都不用再各自刷背景 */}
        <ThemeProvider value={navigationTheme}>
        <QueryClientProvider client={queryClient}>
          <ServerSessionProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <PlayerBridge />
              <Stack screenOptions={stackScreenOptions}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ title: '连接服务器' }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                {/* 播放页是从底部升起的浮层（对齐 Apple Music 的「正在播放」）：
                    导航栏左侧是向下箭头收起，页内三页左右滑动，所以自己画头部。
                    播放队列在播放页里当第三页，没有单独的路由。 */}
                <Stack.Screen
                  name="player"
                  options={{
                    headerShown: false,
                    presentation: 'transparentModal',
                    animation: 'none',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <Stack.Screen name="dev-smoke" options={{ title: '自检' }} />
              </Stack>
            </ToastProvider>
          </ServerSessionProvider>
        </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
})
