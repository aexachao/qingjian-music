import { Stack } from 'expo-router'
import { useStackScreenOptions, tabRootOptions, detailScreenOptions } from '@/lib/stack-options'

export default function StackLayout() {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* 页签根页用 iOS 大标题，二级页面用普通标题 */}
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: '首页' }} />
      <Stack.Screen name="album/[id]" options={detailScreenOptions} />
      <Stack.Screen name="playlist/[id]" options={detailScreenOptions} />
      <Stack.Screen name="artist/[id]" options={detailScreenOptions} />
      <Stack.Screen name="favorites" options={{ title: '我喜欢的音乐' }} />
    </Stack>
  )
}
