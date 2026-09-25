import { Stack } from 'expo-router'
import { useStackScreenOptions, tabRootOptions, detailScreenOptions } from '@/lib/stack-options'

export default function StackLayout() {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* 页签根页用 iOS 大标题，二级页面用普通标题 */}
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: '搜索' }} />
      {/* 搜索态：输入框由**页内自绘顶栏**承载（原生 headerTitle 不给自定义 View 分配宽度、
          也拿不到焦点），所以这里关掉原生导航栏 */}
      <Stack.Screen name="query" options={tabRootOptions} />
      <Stack.Screen name="album/[id]" options={detailScreenOptions} />
      <Stack.Screen name="playlist/[id]" options={detailScreenOptions} />
      <Stack.Screen name="genre/[id]" options={detailScreenOptions} />
      <Stack.Screen name="artist/[id]" options={detailScreenOptions} />
    </Stack>
  )
}
