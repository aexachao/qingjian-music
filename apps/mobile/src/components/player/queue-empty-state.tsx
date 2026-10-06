import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useQueueStyles } from './queue-shared'

export interface EmptyStateAction {
  label: string
  onPress: () => void
}

export interface QueueEmptyStateProps {
  title: string
  description?: string
  action?: EmptyStateAction
  minHeight?: number
  scrollY?: SharedValue<number>
}

export function QueueEmptyState({
  title,
  description,
  action,
  minHeight,
  scrollY,
}: QueueEmptyStateProps) {
  const styles = useQueueStyles()
  const animatedStyle = useAnimatedStyle(() => {
    // 动态垂直居中：根据上方循环工具栏是否吸顶，动态计算 list 视口高度并垂直居中
    // scrollY == 0（未吸顶）：视口为 stageHeight - 194，相对于容器（stageHeight - 106）向上偏移 44pt
    // scrollY >= 88（吸顶）：视口为 stageHeight - 106，无偏移（正好居中）
    const currentScrollY = scrollY ? Math.min(88, Math.max(0, scrollY.value)) : 0
    const shiftY = -(88 - currentScrollY) / 2
    return {
      transform: [
        { translateY: shiftY },
      ],
    }
  })

  return (
    <View
      style={[
        styles.emptyStateContainer,
        minHeight !== undefined && { height: minHeight },
      ]}
    >
      <Animated.View style={[styles.emptyStateContent, animatedStyle]}>
        <Text style={styles.emptyStateTitle}>{title}</Text>
        {description ? <Text style={styles.emptyStateSubtitle}>{description}</Text> : null}
        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={8}
            style={({ pressed }) => [styles.emptyStateButton, pressed && styles.emptyStateButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={styles.emptyStateButtonText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  )
}
