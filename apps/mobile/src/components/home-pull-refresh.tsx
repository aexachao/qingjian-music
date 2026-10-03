import { useCallback, useEffect, useRef } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import {
  HOME_PULL_REFRESH_THRESHOLD,
  createHomePullRefreshController,
  homePullDistance,
} from '@/lib/home-pull-refresh-policy'
import { Icon, iconSize } from '@/components/icon'
import { tap } from '@/lib/haptics'
import { useThemeColors } from '@/theme/theme-provider'

function triggerLightImpact(): void {
  tap()
}

interface UseHomePullRefreshOptions {
  enabled: boolean
  refreshing: boolean
  onRefresh: () => boolean | Promise<boolean>
  scrollY: SharedValue<number>
}

/**
 * iOS needs an explicit threshold because RN's RefreshControl only reports the
 * refresh after UIKit has already picked its own trigger point. The worklet
 * observes native bounce without adding a competing gesture recognizer.
 */
export function useHomePullRefresh({
  enabled,
  refreshing,
  onRefresh,
  scrollY,
}: UseHomePullRefreshOptions) {
  const pullDistance = useSharedValue(0)
  const refreshingOnUI = useSharedValue(refreshing)
  const latestCallbacks = useRef({ onRefresh })
  const mountedRef = useRef(true)
  latestCallbacks.current = { onRefresh }

  const controllerRef = useRef(
    createHomePullRefreshController({
      onThresholdCrossed: triggerLightImpact,
      onRefresh: () => latestCallbacks.current.onRefresh(),
    }),
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    controllerRef.current.setRefreshing(refreshing)
    refreshingOnUI.value = refreshing
  }, [refreshing, refreshingOnUI])

  const beginDrag = useCallback(() => {
    if (mountedRef.current) controllerRef.current.beginDrag()
  }, [])
  const crossedThreshold = useCallback(() => {
    if (mountedRef.current) controllerRef.current.scroll(-HOME_PULL_REFRESH_THRESHOLD)
  }, [])
  const endDrag = useCallback(
    (contentOffsetY: number, contentInsetTop: number) => {
      if (mountedRef.current) controllerRef.current.endDrag(contentOffsetY, contentInsetTop)
    },
    [],
  )

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: (_event, context) => {
      scrollY.value = _event.contentOffset.y
      if (!enabled || refreshingOnUI.value) return
      context.homePullDragging = true
      context.homePullHapticSent = false
      runOnJS(beginDrag)()
    },
    onScroll: (event, context) => {
      scrollY.value = event.contentOffset.y
      const distance = homePullDistance(event.contentOffset.y, event.contentInset.top)
      pullDistance.value = distance
      if (!enabled || !context.homePullDragging || refreshingOnUI.value) return

      if (distance >= HOME_PULL_REFRESH_THRESHOLD && !context.homePullHapticSent) {
        context.homePullHapticSent = true
        runOnJS(crossedThreshold)()
      }
    },
    onEndDrag: (event, context) => {
      if (!enabled || !context.homePullDragging) return
      context.homePullDragging = false
      const distance = homePullDistance(event.contentOffset.y, event.contentInset.top)
      pullDistance.value = distance
      if (distance >= HOME_PULL_REFRESH_THRESHOLD && !context.homePullHapticSent) {
        context.homePullHapticSent = true
        runOnJS(crossedThreshold)()
      }
      runOnJS(endDrag)(event.contentOffset.y, event.contentInset.top)
    },
  })

  return { onScroll, pullDistance, refreshingOnUI }
}

interface HomePullRefreshIndicatorProps {
  pullDistance: SharedValue<number>
  refreshing: boolean
  refreshingOnUI: SharedValue<boolean>
  top: number
}

/** A small neutral capsule remains legible over the large title while refreshing. */
export function HomePullRefreshIndicator({
  pullDistance,
  refreshing,
  refreshingOnUI,
  top,
}: HomePullRefreshIndicatorProps) {
  const colors = useThemeColors()
  const indicatorStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, pullDistance.value / HOME_PULL_REFRESH_THRESHOLD)
    const visible = Math.max(progress, refreshingOnUI.value ? 1 : 0)
    return {
      opacity: interpolate(visible, [0, 0.12, 1], [0, 0, 1]),
      transform: [
        { translateY: interpolate(visible, [0, 1], [-10, 0]) },
        { scale: interpolate(visible, [0, 1], [0.92, 1]) },
      ],
    }
  })
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(Math.min(pullDistance.value, HOME_PULL_REFRESH_THRESHOLD), [0, HOME_PULL_REFRESH_THRESHOLD], [0, 180])}deg` },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.indicator, indicatorStyle, { top, backgroundColor: colors.bgFloatingPill, borderColor: colors.borderSubtle }]}
    >
      {refreshing ? (
        <ActivityIndicator size="small" color={colors.loadingIndicator} />
      ) : (
        <Animated.View style={arrowStyle}>
          <Icon name="arrowDown" size={iconSize.sm} color={colors.loadingIndicator} />
        </Animated.View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  indicator: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 40,
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
