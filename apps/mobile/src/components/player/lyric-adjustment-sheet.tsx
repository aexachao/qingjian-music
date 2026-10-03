import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useReducedMotion } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { formatProgressStatus, OFFSET_STEP_MS } from '@/lib/lyric-offset'
import { tap } from '@/lib/haptics'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

interface LyricAdjustmentSheetProps {
  visible: boolean
  offsetMs: number
  onAdjust: (deltaMs: number) => void
  onClose: () => void
}

export function LyricAdjustmentSheet({ visible, offsetMs, onAdjust, onClose }: LyricAdjustmentSheetProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()

  const adjust = (deltaMs: number) => {
    tap()
    onAdjust(deltaMs)
  }

  const handleReset = () => {
    if (Math.abs(offsetMs) < 10) return
    tap()
    onAdjust(-offsetMs)
  }

  const isResetDisabled = Math.abs(offsetMs) < 10

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* 透明遮罩点击区域：无黑色蒙版，保持背景歌词 100% 清晰可见 */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="关闭歌词调整"
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }]}>
          {/* 拖动把手 */}
          <View style={styles.handle} />

          {/* 状态居中文案：对齐 Apple Music，如「歌词进度 正常」或「歌词进度 提前 0.1 秒」 */}
          <Text style={styles.statusText}>{formatProgressStatus(offsetMs)}</Text>

          {/* 三等分操作按钮行：延后 0.1 秒 | 重置 | 提前 0.1 秒 */}
          <View style={styles.buttonRow}>
            {/* 延后 0.1 秒 */}
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={() => adjust(-OFFSET_STEP_MS)}
              accessibilityRole="button"
              accessibilityLabel="歌词延后 0.1 秒"
            >
              <View style={styles.iconContainer}>
                <Svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.textPrimary}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M5 12h14" />
                </Svg>
              </View>
              <Text style={styles.buttonLabel}>延后 0.1 秒</Text>
            </Pressable>

            {/* 重置 */}
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                pressed && !isResetDisabled && styles.actionButtonPressed,
                isResetDisabled && styles.actionButtonDisabled,
              ]}
              onPress={handleReset}
              disabled={isResetDisabled}
              accessibilityRole="button"
              accessibilityLabel="重置歌词进度"
            >
              <View style={styles.iconContainer}>
                <Svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isResetDisabled ? colors.textTertiary : colors.textPrimary}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
                  <Path d="M3 3v5h5" />
                </Svg>
              </View>
              <Text style={[styles.buttonLabel, isResetDisabled && styles.buttonLabelDisabled]}>重置</Text>
            </Pressable>

            {/* 提前 0.1 秒 */}
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={() => adjust(OFFSET_STEP_MS)}
              accessibilityRole="button"
              accessibilityLabel="歌词提前 0.1 秒"
            >
              <View style={styles.iconContainer}>
                <Svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.textPrimary}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M5 12h14M12 5v14" />
                </Svg>
              </View>
              <Text style={styles.buttonLabel}>提前 0.1 秒</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const useStyles = createThemedStyles((colors) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', // 彻底移除暗色遮罩，背后歌词完全可见
  },
  sheet: {
    backgroundColor: 'rgba(28, 28, 30, 0.96)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    // 阴影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  statusText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.medium,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xxl,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionButtonPressed: {
    opacity: 0.6,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  iconContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  buttonLabel: {
    ...typography.subhead,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  buttonLabelDisabled: {
    color: colors.textTertiary,
  },
}))
