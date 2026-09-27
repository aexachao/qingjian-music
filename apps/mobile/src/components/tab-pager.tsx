import React, { useEffect, useRef, useState } from 'react'
import {
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

export interface TabPagerProps {
  /** 当前激活的页签索引 (从 0 开始) */
  activeIndex: number
  /** 子页面列表（每个 child 对应一个 tab 页） */
  children: React.ReactNode[]
  /** 外层容器样式 */
  style?: StyleProp<ViewStyle>
  /** 是否开启懒加载（默认 true，首次切换到该页签时才挂载，访问后保持挂载以保留滚动与状态） */
  lazy?: boolean
  /** 切换动画完成回调 */
  onTransitionEnd?: (index: number) => void
}

/**
 * 通用平滑横向分页过渡器（完全对齐播放列表中的 tab 切换效果）：
 * 采用贝塞尔物理曲线 Easing.bezier(0.25, 0.1, 0.25, 1)，
 * 随页签切换在水平轨道上平滑位移，保留各列表的独立滚动与渲染上下文。
 */
export function TabPager({
  activeIndex,
  children,
  style,
  lazy = true,
  onTransitionEnd,
}: TabPagerProps) {
  const { width: windowWidth } = useWindowDimensions()
  const [containerWidth, setContainerWidth] = useState(0)
  const pageWidth = containerWidth || windowWidth

  const pagerX = useSharedValue(-activeIndex * pageWidth)
  const isInitialRef = useRef(true)

  // 记录已经访问过的页面索引，首次被访问时挂载，之后保持挂载
  const [visited, setVisited] = useState<Set<number>>(() => new Set([activeIndex]))
  const [prevActiveIndex, setPrevActiveIndex] = useState(activeIndex)

  if (prevActiveIndex !== activeIndex) {
    setPrevActiveIndex(activeIndex)
    if (!visited.has(activeIndex)) {
      setVisited((prev) => new Set(prev).add(activeIndex))
    }
  }

  useEffect(() => {
    const targetX = -activeIndex * pageWidth
    if (isInitialRef.current) {
      pagerX.value = targetX
      isInitialRef.current = false
      return
    }

    pagerX.value = withTiming(
      targetX,
      {
        duration: 320,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      },
      (finished) => {
        if (finished && onTransitionEnd) {
          runOnJS(onTransitionEnd)(activeIndex)
        }
      },
    )
  }, [activeIndex, onTransitionEnd, pageWidth, pagerX])

  const pagerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pagerX.value }],
  }))

  const count = children.length

  return (
    <View
      style={[styles.viewport, style]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        if (w > 0 && Math.abs(w - containerWidth) > 1) {
          setContainerWidth(w)
        }
      }}
    >
      <Animated.View
        style={[
          styles.track,
          { width: pageWidth * count },
          pagerAnimatedStyle,
        ]}
      >
        {children.map((child, index) => {
          const isCurrent = index === activeIndex
          const shouldRender = !lazy || visited.has(index)
          return (
            <View
              key={index}
              style={[styles.page, { width: pageWidth }]}
              pointerEvents={isCurrent ? 'auto' : 'none'}
              aria-hidden={!isCurrent}
            >
              {shouldRender ? child : null}
            </View>
          )
        })}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  track: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    flex: 1,
  },
})
