import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayerStore } from '@/player/store'

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56
const MINI_PLAYER_HEIGHT = 68

/** 列表底部要给 Tab 栏和迷你播放条留位置 */
export function useBottomSpace(): number {
  const insets = useSafeAreaInsets()
  const hasQueue = usePlayerStore((state) => state.queue.length > 0)
  return insets.bottom + TAB_BAR_HEIGHT + (hasQueue ? MINI_PLAYER_HEIGHT : 0) + 16
}
