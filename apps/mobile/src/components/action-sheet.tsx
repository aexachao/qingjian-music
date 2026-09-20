import { useEffect, useRef, useState } from 'react'
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
import { Icon, type IconName } from '@/components/icon'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

export interface ActionSheetItem {
  key: string
  title: string
  icon?: IconName
  /** 危险操作（红字，如删除）；本轮曲库暂不用，先留着 */
  destructive?: boolean
}

export interface ActionSheetProps {
  visible: boolean
  title?: string
  items: ActionSheetItem[]
  onSelect: (key: string) => void
  onClose: () => void
}

/**
 * 通用底部动作面板（iOS 系统 ··· → action sheet 的形态）。
 * 用于曲库卡片右侧「···」（扫描本库）和导航栏「···」（扫描所有音乐库）。
 * 只负责展示与选择，动作派发交给调用方。
 */
export function ActionSheet({ visible, title, items, onSelect, onClose }: ActionSheetProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(visible)
  const closingRef = useRef(false)
  const [anim] = useState(() => new Animated.Value(0))

  // 退场动画期间保留最后一次内容，避免闪烁
  const cachedTitle = useRef(title)
  const cachedItems = useRef(items)
  if (visible) {
    cachedTitle.current = title
    cachedItems.current = items
  }

  useEffect(() => {
    if (visible) {
      closingRef.current = false
      setMounted(true)
      anim.setValue(0)
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    } else if (mounted && !closingRef.current) {
      closingRef.current = true
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        closingRef.current = false
        setMounted(false)
      })
    }
  }, [visible, mounted, anim])

  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      closingRef.current = false
      setMounted(false)
      onClose()
    })
  }

  const select = (key: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onSelect(key)
    close()
  }

  if (!mounted) return null

  const backdropStyle = { opacity: anim }
  const sheetStyle = {
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) },
    ],
  }

  const activeTitle = visible ? title : cachedTitle.current
  const activeItems = visible ? items : cachedItems.current

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={close}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="关闭菜单"
          />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          <View style={styles.handle} />
          {activeTitle ? <Text style={styles.title}>{activeTitle}</Text> : null}
          <View style={styles.list}>
            {activeItems.map((item) => (
              <Pressable
                key={item.key}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => select(item.key)}
                accessibilityRole="menuitem"
                accessibilityLabel={item.title}
              >
                {item.icon ? (
                  <Icon
                    name={item.icon}
                    size={20}
                    color={item.destructive ? colors.danger : colors.textPrimary}
                  />
                ) : null}
                <Text style={[styles.rowText, item.destructive && styles.rowTextDanger]}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const useStyles = createThemedStyles((colors) => ({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgOverlay },
  sheet: {
    backgroundColor: colors.bgModal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSelected,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  title: {
    ...typography.subhead,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 12,
  },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.bgListItemSoft,
  },
  rowPressed: { backgroundColor: colors.bgListItemHover },
  rowText: { ...typography.body, fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  rowTextDanger: { color: colors.danger },
}))
