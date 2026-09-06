import { useEffect, useState } from 'react'
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

/** 每像素滚多少毫秒：越大越慢 */
const MS_PER_PIXEL = 22
/** 两端各停多久再继续滚 */
const PAUSE_MS = 1400
/** 溢出小于这个值就不折腾，直接静止显示 */
const MIN_OVERFLOW = 6
/**
 * 给文字一个足够宽的盒子。
 * numberOfLines={1} 会按可用宽度截断成「…」，只有把盒子撑开才会真的溢出，
 * 外层容器 overflow: hidden 负责裁掉多余部分。
 */
const TEXT_BOX_WIDTH = 4000

interface MarqueeTextProps {
  text: string
  style?: StyleProp<TextStyle>
  containerStyle?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

/**
 * 装不下的长文字来回滚动（Apple Music 的歌名就是这种）。
 * 文字真实宽度用 onTextLayout 拿——它给的是这一行字形的宽度，不是盒子宽度。
 */
export function MarqueeText({ text, style, containerStyle, accessibilityLabel }: MarqueeTextProps) {
  const [containerWidth, setContainerWidth] = useState(0)
  const [textWidth, setTextWidth] = useState(0)
  const translateX = useSharedValue(0)

  const overflow = textWidth - containerWidth

  useEffect(() => {
    translateX.value = 0
    if (containerWidth <= 0 || overflow <= MIN_OVERFLOW) return
    const duration = Math.round(overflow * MS_PER_PIXEL)
    // 停一下 → 滚到尾 → 停一下 → 滚回头，无限循环
    translateX.value = withDelay(
      PAUSE_MS,
      withRepeat(
        withSequence(
          withTiming(-overflow, { duration, easing: Easing.linear }),
          withDelay(PAUSE_MS, withTiming(0, { duration, easing: Easing.linear })),
          withDelay(PAUSE_MS, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      ),
    )
  }, [containerWidth, overflow, text, translateX])

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

  return (
    <View
      style={[styles.clip, containerStyle]}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={accessibilityLabel ?? text}
    >
      <Animated.Text
        numberOfLines={1}
        style={[style, styles.text, animatedStyle]}
        onTextLayout={(event) => {
          const measured = event.nativeEvent.lines[0]?.width
          if (measured) setTextWidth(Math.ceil(measured))
        }}
      >
        {text}
      </Animated.Text>
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  text: { width: TEXT_BOX_WIDTH },
})
