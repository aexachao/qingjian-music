import { useEffect, useState, useSyncExternalStore } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Stack, ThemeProvider as NavigationThemeProvider, type ErrorBoundaryProps } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ConfirmProvider } from '@/components/confirm-modal'
import { FatalErrorScreen } from '@/components/fatal-error-screen'
import { PromptProvider } from '@/components/prompt-modal'
import { ToastProvider } from '@/components/toast'
import { useAppearancePreferences, useEffectiveTheme } from '@/lib/appearance-preferences'
import {
  clearFatalError,
  getFatalError,
  reportFatalError,
  subscribeFatalError,
} from '@/lib/fatal-error-capture'
import { queryClient } from '@/lib/query-client'
import { ServerSessionProvider } from '@/lib/server-session'
import { getNavigationTheme, useStackScreenOptions } from '@/lib/stack-options'
import { PlayerBridge } from '@/player/bridge'
import { AppThemeProvider, useThemeColors } from '@/theme/theme-provider'

/**
 * 渲染期异常（Error Boundary）也汇入同一个错误屏 —— 未捕获异常走入口装的全局处理器，
 * 两者最终显示同一个界面，用户只需要看一处。
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportFatalError(error, 'render', Date.now())
  }, [error])
  return <FatalErrorScreen error={{ message: error.message, stack: error.stack, source: 'render', at: 0 }} onRetry={() => void retry()} />
}

/** 订阅致命错误。用 useSyncExternalStore 而不是 useState，避免「挂载前就出错」时丢事件 */
function useFatalError() {
  return useSyncExternalStore(subscribeFatalError, getFatalError, getFatalError)
}

// Montserrat 由 expo-font 配置插件在构建期嵌入（见 app.json），启动即可用，无需运行时加载
export default function RootLayout() {
  const fatal = useFatalError()
  const [, forceRender] = useState(0)
  // 错误屏不挂 Provider：能走到这里说明应用树里某处已经坏了，再依赖 Provider 会一起崩
  if (fatal) {
    return (
      <FatalErrorScreen
        error={fatal}
        onRetry={() => {
          clearFatalError()
          forceRender((n) => n + 1)
        }}
      />
    )
  }
  return <Providers />
}

function Providers() {
  const effectiveTheme = useEffectiveTheme()
  const followsSystem = useAppearancePreferences((state) => state.themeMode === 'system')
  return (
    <AppThemeProvider mode={effectiveTheme} followsSystem={followsSystem}>
      <ThemedRoot effectiveTheme={effectiveTheme} />
    </AppThemeProvider>
  )
}

function ThemedRoot({ effectiveTheme }: { effectiveTheme: 'dark' | 'light' }) {
  const colors = useThemeColors()
  const navTheme = getNavigationTheme(effectiveTheme)
  const stackScreenOptions = useStackScreenOptions()

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <SafeAreaProvider>
        <NavigationThemeProvider value={navTheme}>
          <QueryClientProvider client={queryClient}>
            <ServerSessionProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <PromptProvider>
                    <StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'} />
                  <PlayerBridge />
                  <Stack screenOptions={stackScreenOptions}>
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="login" options={{ headerShown: false }} />
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen
                      name="player"
                      options={{
                        headerShown: false,
                        presentation: 'transparentModal',
                        animation: 'none',
                        contentStyle: { backgroundColor: 'transparent' },
                      }}
                    />
                    <Stack.Screen name="track-info" options={{ title: '歌曲信息', presentation: 'modal' }} />
                    <Stack.Screen name="dev-smoke" options={{ title: '自检' }} />
                  </Stack>
                  </PromptProvider>
                </ConfirmProvider>
              </ToastProvider>
            </ServerSessionProvider>
          </QueryClientProvider>
        </NavigationThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
