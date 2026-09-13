import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '@/components/icon'
import { spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void
}

type ConfirmFn = (options: ConfirmOptions) => void

const ConfirmContext = createContext<ConfirmFn | null>(null)

export interface ConfirmModalProps {
  visible: boolean
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(visible)
  const animValue = useRef(new Animated.Value(0)).current
  const isClosingRef = useRef(false)

  // 缓存显示文案，防止关闭过渡期间内容跳变
  const cachedTitle = useRef(title)
  const cachedMessage = useRef(message)
  const cachedConfirmText = useRef(confirmText)
  const cachedCancelText = useRef(cancelText)
  const cachedDestructive = useRef(destructive)

  if (visible) {
    cachedTitle.current = title
    cachedMessage.current = message
    cachedConfirmText.current = confirmText
    cachedCancelText.current = cancelText
    cachedDestructive.current = destructive
  }

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false
      setMounted(true)
      animValue.setValue(0)
      if (destructive) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
      Animated.timing(animValue, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    } else if (mounted && !isClosingRef.current) {
      isClosingRef.current = true
      Animated.timing(animValue, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        isClosingRef.current = false
        setMounted(false)
      })
    }
  }, [visible, mounted, animValue, destructive])

  const handleClose = (callback?: () => void) => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    Animated.timing(animValue, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isClosingRef.current = false
      setMounted(false)
      callback?.()
    })
  }

  const handleCancelPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    handleClose(onCancel)
  }

  const handleConfirmPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    handleClose(() => {
      void onConfirm()
    })
  }

  if (!mounted) return null

  const backdropAnimatedStyle = {
    opacity: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  }

  const sheetAnimatedStyle = {
    transform: [
      {
        translateY: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [380, 0],
        }),
      },
    ],
  }

  const displayTitle = visible ? title : cachedTitle.current
  const displayMessage = visible ? message : cachedMessage.current
  const displayConfirmText = visible ? confirmText : cachedConfirmText.current
  const displayCancelText = visible ? cancelText : cachedCancelText.current
  const isDestructive = visible ? destructive : cachedDestructive.current

  const hasCancel = Boolean(displayCancelText && displayCancelText.trim() !== '')

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={handleCancelPress}
    >
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleCancelPress}
            accessibilityLabel="关闭弹窗"
            accessibilityRole="button"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheetContainer,
            sheetAnimatedStyle,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          {/* 顶部拖动条指示器 */}
          <View style={styles.sheetHandle} />

          {/* 弹窗标题与关闭按钮 */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{displayTitle}</Text>
            <Pressable
              onPress={handleCancelPress}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="关闭"
            >
              <Icon name="close" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* 提示正文 */}
          {displayMessage ? (
            <View style={styles.messageBox}>
              <Text style={styles.message}>{displayMessage}</Text>
            </View>
          ) : null}

          {/* 底部按钮区域 */}
          <View style={styles.buttonRow}>
            {hasCancel ? (
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.cancelButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleCancelPress}
                accessibilityRole="button"
                accessibilityLabel={displayCancelText}
              >
                <Text style={styles.cancelText}>{displayCancelText}</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                isDestructive ? styles.destructiveButton : styles.confirmButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleConfirmPress}
              accessibilityRole="button"
              accessibilityLabel={displayConfirmText}
            >
              <Text style={styles.confirmText}>{displayConfirmText}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [currentOptions, setCurrentOptions] = useState<ConfirmOptions | null>(null)
  const [visible, setVisible] = useState(false)

  const confirm = useCallback((options: ConfirmOptions) => {
    setCurrentOptions(options)
    setVisible(true)
  }, [])

  const handleConfirm = async () => {
    const fn = currentOptions?.onConfirm
    setVisible(false)
    if (fn) await fn()
  }

  const handleCancel = () => {
    const fn = currentOptions?.onCancel
    setVisible(false)
    if (fn) fn()
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        visible={visible}
        title={currentOptions?.title ?? ''}
        message={currentOptions?.message}
        confirmText={currentOptions?.confirmText}
        cancelText={currentOptions?.cancelText}
        destructive={currentOptions?.destructive}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm 必须在 ConfirmProvider 内使用')
  }
  return confirm
}

const useStyles = createThemedStyles((colors) => ({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgOverlay,
  },
  sheetContainer: {
    backgroundColor: colors.bgModal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSelected,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 14,
    minHeight: 28,
  },
  sheetTitle: {
    ...typography.headline,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgListItem,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBox: {
    paddingHorizontal: spacing.xs,
    marginBottom: 20,
  },
  message: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  cancelButton: {
    backgroundColor: colors.bgListItem,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cancelText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmButton: {
    backgroundColor: colors.accent,
  },
  destructiveButton: {
    backgroundColor: colors.accent,
  },
  confirmText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textOnAccent,
  },
}))
