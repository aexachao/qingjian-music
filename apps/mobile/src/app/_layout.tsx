import { useEffect } from 'react'
// 逐字重深导入：包入口会把 18 个字重（含斜体）全打进 bundle，这里只要 4 个
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular'
import { Montserrat_500Medium } from '@expo-google-fonts/montserrat/500Medium'
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold'
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold'
import { useFonts } from 'expo-font'
import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '@/lib/query-client'
import { ServerSessionProvider } from '@/lib/server-session'
import { PlayerBridge } from '@/player/bridge'
import { colors } from '@/theme/tokens'

// 字体没就位就渲染的话，iOS 会因为 fontFamily 不存在直接报错，所以先压住启动图
void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  // Montserrat 是 web 端 --ds-font-family-base 的首选字体，四个字重对应 typography 里的档位
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  // 字体加载失败不阻塞进入 App（系统字体兜底），只是拉丁字形会退回系统
  if (!fontsLoaded && !fontError) return <View style={styles.root} />

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
