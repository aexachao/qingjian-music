import { useSegments } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isTabBarHidden } from '@/lib/tab-bar-policy'
import { usePlayerStore } from '@/player/store'
import { spacing } from '@/theme/tokens'

export const TAB_BAR_HEIGHT = 64
export const MINI_PLAYER_HEIGHT = 68

/** 当前是不是在四个页签里面（二级页面如播放页、队列页没有 Tab 栏） */
function useInTabs(): boolean {
  const segments = useSegments()
  // 搜索态把 Tab 栏藏了（tab-bar-policy），底边距也要按「没有 Tab 栏」算
  if (isTabBarHidden(segments)) return false
  return segments[0] === '(tabs)' || segments[0] === 'player'
}

/**
 * 悬浮层（迷你播放条、Toast）的底部起点：
 * 页签内要让开 Tab 栏，二级页面只让开安全区。
 */
export function useOverlayBottom(): number {
  const insets = useSafeAreaInsets()
  const inTabs = useInTabs()
  return insets.bottom + (inTabs ? TAB_BAR_HEIGHT : 0) + spacing.sm
}

/** 列表底部要给 Tab 栏和迷你播放条留位置 */
export function useBottomSpace(): number {
  const overlay = useOverlayBottom()
  const hasQueue = usePlayerStore((state) => state.queue.length > 0)
  return overlay + (hasQueue ? MINI_PLAYER_HEIGHT : 0) + spacing.md
}
