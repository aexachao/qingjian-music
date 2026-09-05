import { Platform } from 'react-native'
import { useSegments } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayerStore } from '@/player/store'
import { spacing } from '@/theme/tokens'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56
export const MINI_PLAYER_HEIGHT = 68

/** 当前是不是在四个页签里面（二级页面如播放页、队列页没有 Tab 栏） */
function useInTabs(): boolean {
  const segments = useSegments()
  return segments[0] === '(tabs)'
}

/**
 * 悬浮层（迷你播放条、Toast）的底部起点：
 * 页签内要让开 Tab 栏，二级页面只让开安全区。
 */
export function useOverlayBottom(): number {
  const insets = useSafeAreaInsets()
  const inTabs = useInTabs()
  return insets.bottom + (inTabs ? TAB_BAR_HEIGHT : 0) + spacing.xs
}

/** 列表底部要给 Tab 栏和迷你播放条留位置 */
export function useBottomSpace(): number {
  const overlay = useOverlayBottom()
  const hasQueue = usePlayerStore((state) => state.queue.length > 0)
  return overlay + (hasQueue ? MINI_PLAYER_HEIGHT : 0) + spacing.md
}
