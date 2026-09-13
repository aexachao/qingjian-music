import { Stack } from 'expo-router'
import { useStackScreenOptions, tabRootOptions } from '@/lib/stack-options'

export default function StackLayout() {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* 页签根页用 iOS 大标题，二级页面用普通标题 */}
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: '搜索' }} />
    </Stack>
  )
}
