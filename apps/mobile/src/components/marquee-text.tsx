import { useEffect, useState } from 'react'
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

/** 每像素滚多少毫秒：越大越慢 */
const MS_PER_PIXEL = 22
/** 两端各停多久再继续滚 */
const PAUSE_MS = 1400
/** 同一份文字之间的留白，避免尾部直接粘到下一轮开头 */
const MARQUEE_GAP = 32
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
  const shouldScroll = containerWidth > 0 && overflow > 6

  useEffect(() => {
    cancelAnimation(translateX)
    translateX.value = 0
    if (!shouldScroll) return
    const distance = textWidth + MARQUEE_GAP
    const duration = Math.round(distance * MS_PER_PIXEL)
    // 业内常见的 ticker：停一下后单向匀速滚动，第二份文字无缝接上，不来回反弹。
    translateX.value = withDelay(
      PAUSE_MS,
      withRepeat(withTiming(-distance, { duration, easing: Easing.linear }), -1, false),
    )
  }, [shouldScroll, text, textWidth, translateX])

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

  return (
    <View
      style={[styles.clip, containerStyle]}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={accessibilityLabel ?? text}
    >
      <Animated.View style={[styles.track, animatedStyle]}>
        <Animated.Text
          numberOfLines={1}
          style={[style, styles.text]}
          onTextLayout={(event) => {
            const measured = event.nativeEvent.lines[0]?.width
            if (measured) setTextWidth(Math.ceil(measured))
          }}
        >
          {text}
        </Animated.Text>
        {shouldScroll ? (
          <Animated.Text numberOfLines={1} style={[style, styles.text, { marginLeft: MARQUEE_GAP }]}>
            {text}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  track: { flexDirection: 'row', width: TEXT_BOX_WIDTH },
  text: { flexShrink: 0 },
})
