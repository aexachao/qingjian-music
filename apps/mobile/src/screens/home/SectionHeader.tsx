import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Icon, iconSize } from '@/components/icon'
import { colors, typography } from '@/theme/tokens'

interface SectionHeaderProps {
  title: string
  href?: string
  onPress?: () => void
  isInteracting?: () => boolean
}

/**
 * 统一分区标题栏：
 * 遵循 Apple 规范，向右箭头直接紧跟在 label 后面（间距 8pt），点击可直达二级完整页面
 */
export function SectionHeader({ title, href, onPress, isInteracting }: SectionHeaderProps) {
  const router = useRouter()

  const handlePress = () => {
    if (isInteracting?.()) return
    if (onPress) {
      onPress()
    } else if (href) {
      router.push(href as any)
    }
  }

  const isClickable = Boolean(href || onPress)

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.titleRow, isClickable && pressed && styles.pressed]}
        onPress={isClickable ? handlePress : undefined}
        disabled={!isClickable}
        accessibilityRole="button"
        accessibilityLabel={`查看全部${title}`}
      >
        <Text style={styles.title}>{title}</Text>
        {isClickable ? (
          <Icon name="chevronRight" size={14} color={colors.textTertiary} />
        ) : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // 明确对齐：距离 label 8pt
  },
  pressed: {
    opacity: 0.65,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
})
