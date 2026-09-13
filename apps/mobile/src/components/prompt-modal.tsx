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
  TextInput,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '@/components/icon'
import { spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

export interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  maxLength?: number
  /** 验证函数，返回错误文案；通过时返回空串或 undefined */
  validate?: (value: string) => string | undefined
  onConfirm: (value: string) => void | Promise<void>
  onCancel?: () => void
}

type PromptFn = (options: PromptOptions) => void

const PromptContext = createContext<PromptFn | null>(null)

export interface PromptModalProps {
  visible: boolean
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  maxLength?: number
  validate?: (value: string) => string | undefined
  onConfirm: (value: string) => void | Promise<void>
  onCancel: () => void
}

export function PromptModal({
  visible,
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmText = '确定',
  cancelText = '取消',
  maxLength,
  validate,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(visible)
  const animValue = useRef(new Animated.Value(0)).current
  const isClosingRef = useRef(false)
  const inputRef = useRef<TextInput>(null)
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState<string | null>(null)

  const cachedTitle = useRef(title)
  const cachedMessage = useRef(message)
  const cachedPlaceholder = useRef(placeholder)
  const cachedConfirmText = useRef(confirmText)
  const cachedCancelText = useRef(cancelText)
  const cachedMaxLength = useRef(maxLength)

  if (visible) {
    cachedTitle.current = title
    cachedMessage.current = message
    cachedPlaceholder.current = placeholder
    cachedConfirmText.current = confirmText
    cachedCancelText.current = cancelText
    cachedMaxLength.current = maxLength
  }

  useEffect(() => {
    if (visible) {
      setValue(defaultValue)
      setError(null)
      isClosingRef.current = false
      setMounted(true)
      animValue.setValue(0)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      Animated.timing(animValue, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        inputRef.current?.focus()
      })
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
  }, [visible, mounted, animValue, defaultValue])

  const handleClose = (callback?: () => void) => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    inputRef.current?.blur()
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

  const handleCancel = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    handleClose(onCancel)
  }

  const handleConfirm = () => {
    const trimmed = value.trim()
    if (validate) {
      const err = validate(trimmed)
      if (err) {
        setError(err)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    handleClose(() => {
      void onConfirm(trimmed)
    })
  }

  if (!mounted) return null

  const displayTitle = visible ? title : cachedTitle.current
  const displayMessage = visible ? message : cachedMessage.current
  const displayPlaceholder = visible ? placeholder : cachedPlaceholder.current
  const displayConfirmText = visible ? confirmText : cachedConfirmText.current
  const displayCancelText = visible ? cancelText : cachedCancelText.current
  const displayMaxLength = visible ? maxLength : cachedMaxLength.current

  const backdropAnimatedStyle = {
    opacity: animValue.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
  }
  const sheetAnimatedStyle = {
    transform: [
      {
        translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [380, 0] }),
      },
    ],
  }

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={handleCancel}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleCancel}
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
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{displayTitle}</Text>
            <Pressable
              onPress={handleCancel}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="关闭"
            >
              <Icon name="close" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          {displayMessage ? (
            <View style={styles.messageBox}>
              <Text style={styles.message}>{displayMessage}</Text>
            </View>
          ) : null}

          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={[styles.input, error ? styles.inputError : null]}
              value={value}
              onChangeText={(text) => {
                setValue(text)
                if (error) setError(null)
              }}
              placeholder={displayPlaceholder}
              placeholderTextColor={colors.textTertiary}
              maxLength={displayMaxLength}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel={displayCancelText}
            >
              <Text style={styles.cancelText}>{displayCancelText}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.confirmButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleConfirm}
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

export function PromptProvider({ children }: { children: ReactNode }) {
  const [currentOptions, setCurrentOptions] = useState<PromptOptions | null>(null)
  const [visible, setVisible] = useState(false)

  const prompt = useCallback((options: PromptOptions) => {
    setCurrentOptions(options)
    setVisible(true)
  }, [])

  const handleConfirm = async (value: string) => {
    const fn = currentOptions?.onConfirm
    setVisible(false)
    if (fn) await fn(value)
  }

  const handleCancel = () => {
    const fn = currentOptions?.onCancel
    setVisible(false)
    if (fn) fn()
  }

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <PromptModal
        visible={visible}
        title={currentOptions?.title ?? ''}
        message={currentOptions?.message}
        placeholder={currentOptions?.placeholder}
        defaultValue={currentOptions?.defaultValue ?? ''}
        confirmText={currentOptions?.confirmText}
        cancelText={currentOptions?.cancelText}
        maxLength={currentOptions?.maxLength}
        validate={currentOptions?.validate}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </PromptContext.Provider>
  )
}

export function usePrompt(): PromptFn {
  const prompt = useContext(PromptContext)
  if (!prompt) {
    throw new Error('usePrompt 必须在 PromptProvider 内使用')
  }
  return prompt
}

const useStyles = createThemedStyles((colors) => ({
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
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
    marginBottom: 14,
  },
  message: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  inputWrap: { marginBottom: 20 },
  input: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.bgListItem,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 6,
    marginLeft: 4,
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
  buttonPressed: { opacity: 0.75 },
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
  confirmButton: { backgroundColor: colors.accent },
  confirmText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textOnAccent,
  },
}))
