import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { MINI_PLAYER_HEIGHT, useOverlayBottom } from '@/lib/bottom-space'
import { usePlayerStore } from '@/player/store'
import { radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles } from '@/theme/theme-provider'

/** 一条提示停留多久 */
const TOAST_DURATION = 1800

interface ToastMessage {
  /** 每次调用都换一个 id，连续两次同样的文案也能重新播动画 */
  id: number
  text: string
}

const ToastContext = createContext<((text: string) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((text: string) => {
    seq.current += 1
    setMessage({ id: seq.current, text })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), TOAST_DURATION)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ToastHost message={message} />
    </ToastContext.Provider>
  )
}

/** 取「弹一条提示」的函数：toast('已添加到我喜欢的音乐') */
export function useToast(): (text: string) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast 必须在 ToastProvider 里使用')
  return show
}

function ToastHost({ message }: { message: ToastMessage | null }) {
  const styles = useStyles()
  const overlayBottom = useOverlayBottom()
  const hasQueue = usePlayerStore((state) => state.queue.length > 0)
  const opacity = useSharedValue(0)
  const offset = useSharedValue(12)

  useEffect(() => {
    const visible = message !== null
    opacity.value = withTiming(visible ? 1 : 0, { duration: 180 })
    offset.value = withTiming(visible ? 0 : 12, { duration: 180 })
  }, [message, offset, opacity])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: offset.value }] }))
  // 迷你条在的时候要抬到它上面，不能盖住播放控制
  const bottom = overlayBottom + (hasQueue ? MINI_PLAYER_HEIGHT + spacing.sm : 0)

  return (
    <View style={[styles.host, { bottom }]} pointerEvents="none">
      <Animated.View style={[styles.toast, style]}>
        <Text style={styles.text} numberOfLines={2}>
          {message?.text ?? ''}
        </Text>
      </Animated.View>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    maxWidth: '86%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bgFloatingSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
  },
  text: { ...typography.footnote, color: colors.textPrimary, textAlign: 'center' },
}))
