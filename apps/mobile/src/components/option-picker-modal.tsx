import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '@/components/icon'
import { spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

export interface OptionPickerItem<T extends string = string> {
  key: T
  title: string
  subtitle?: string
}

export interface OptionPickerModalProps<T extends string = string> {
  visible: boolean
  title: string
  options: OptionPickerItem<T>[]
  selectedKey?: T
  onSelect: (key: T) => void
  onClose: () => void
}

const SCREEN_HEIGHT = Dimensions.get('window').height
const MAX_SHEET_SCROLL_HEIGHT = Math.min(SCREEN_HEIGHT * 0.65, 480)

export function OptionPickerModal<T extends string = string>({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
}: OptionPickerModalProps<T>) {
  const colors = useThemeColors()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(visible)
  const isClosingRef = useRef(false)
  const animValue = useRef(new Animated.Value(0)).current

  // 保持缓存的渲染数据，避免退场动画过程中标题或选项闪烁消失
  const cachedTitleRef = useRef(title)
  const cachedOptionsRef = useRef(options)
  const cachedSelectedRef = useRef(selectedKey)

  if (visible) {
    cachedTitleRef.current = title
    cachedOptionsRef.current = options
    cachedSelectedRef.current = selectedKey
  }

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false
      setMounted(true)
      animValue.setValue(0)
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
  }, [visible, mounted, animValue])

  const handleClose = () => {
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
      onClose()
    })
  }

  const handleSelect = (key: T) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onSelect(key)
    handleClose()
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
          outputRange: [420, 0],
        }),
      },
    ],
  }

  const activeSelectedKey = visible ? selectedKey : cachedSelectedRef.current
  const activeTitle = visible ? title : cachedTitleRef.current
  const activeOptions = visible ? options : cachedOptionsRef.current

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
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
            <Text style={styles.sheetTitle}>{activeTitle}</Text>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="关闭"
            >
              <Icon name="close" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* 选项列表（带最大高度自适应，超出时滚动） */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.optionsList}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {activeOptions.map((item) => {
              const selected = activeSelectedKey === item.key
              return (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    styles.optionCard,
                    pressed && styles.optionCardPressed,
                  ]}
                  onPress={() => handleSelect(item.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionTitle}>{item.title}</Text>
                    {item.subtitle ? (
                      <Text style={styles.optionSubtitle}>{item.subtitle}</Text>
                    ) : null}
                  </View>

                  {selected ? (
                    <Icon name="check" size={20} color={colors.accent} />
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
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
    marginBottom: 18,
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
  scroll: {
    maxHeight: MAX_SHEET_SCROLL_HEIGHT,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.bgListItemSoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  optionCardPressed: {
    backgroundColor: colors.bgListItemHover,
  },
  optionInfo: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  optionTitle: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  optionSubtitle: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textTertiary,
  },
}))
