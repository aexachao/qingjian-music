import { QueryClientProvider } from '@tanstack/react-query'
import { Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { MiniPlayerHost } from '@/components/mini-player-host'
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
                {/* 播放页与队列页都是正经的二级页面（push），不是弹窗。
                    队列页用原生导航栏，和资料库里的详情页保持同一种样式；
                    播放页是整屏的「正在播放」，只留一个返回按钮，所以自己画头部。 */}
                {/* 封面本身要左右滑动切歌，所以关掉整屏拖拽返回，只留左边缘返回手势 */}
                <Stack.Screen name="player" options={{ headerShown: false, fullScreenGestureEnabled: false }} />
                <Stack.Screen name="queue" options={{ title: '播放队列' }} />
                <Stack.Screen name="dev-smoke" options={{ title: '自检' }} />
              </Stack>
              {/* 迷你条挂在导航之外：二级页面没有 Tab 栏时它也要留在底部 */}
              <MiniPlayerHost />
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
