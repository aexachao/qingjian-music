import { Stack } from 'expo-router'
import { stackScreenOptions, tabRootOptions } from '@/lib/stack-options'

export default function StackLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* 页签根页用 iOS 大标题，二级页面用普通标题 */}
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: '设置' }} />
    </Stack>
  )
}
