import { Stack } from 'expo-router'
import { useStackScreenOptions, tabRootOptions } from '@/lib/stack-options'

export default function StackLayout() {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* 页签根页用 iOS 大标题，二级页面用普通标题 */}
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: '设置' }} />
      <Stack.Screen name="audio-quality" options={{ title: '音质偏好' }} />
      <Stack.Screen name="cache" options={{ title: '缓存' }} />
      <Stack.Screen name="appearance" options={{ title: '外观主题' }} />
      <Stack.Screen name="about" options={{ title: '关于' }} />
      <Stack.Screen name="support" options={{ title: '支持作者' }} />
    </Stack>
  )
}
