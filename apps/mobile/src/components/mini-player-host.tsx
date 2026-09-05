import { StyleSheet, View } from 'react-native'
import { useSegments } from 'expo-router'
import { MiniPlayer } from '@/components/mini-player'
import { useOverlayBottom } from '@/lib/bottom-space'

/**
 * 迷你播放条的全局挂载点。放在根布局里，所以进了二级页面（没有 Tab 栏）也还在底部。
 * 只有两个地方不显示：正在播放页本身，以及登录 / 启动分流页。
 */
export function MiniPlayerHost() {
  const segments = useSegments()
  const bottom = useOverlayBottom()
  const root = segments[0]
  if (root === 'player' || root === 'login' || root === undefined) return null

  return (
    <View style={[styles.host, { bottom }]} pointerEvents="box-none">
      <MiniPlayer />
    </View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0 },
})
