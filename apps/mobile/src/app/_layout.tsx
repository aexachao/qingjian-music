import { QueryClientProvider } from '@tanstack/react-query'
import { Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ConfirmProvider } from '@/components/confirm-modal'
import { PromptProvider } from '@/components/prompt-modal'
import { ToastProvider } from '@/components/toast'
import { useAppearancePreferences, useEffectiveTheme } from '@/lib/appearance-preferences'
import { queryClient } from '@/lib/query-client'
import { ServerSessionProvider } from '@/lib/server-session'
import { getNavigationTheme, useStackScreenOptions } from '@/lib/stack-options'
import { PlayerBridge } from '@/player/bridge'
import { AppThemeProvider, useThemeColors } from '@/theme/theme-provider'

// Montserrat 由 expo-font 配置插件在构建期嵌入（见 app.json），启动即可用，无需运行时加载
export default function RootLayout() {
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
