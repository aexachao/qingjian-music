import { useCallback, useEffect, useRef } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import type { PlayMode } from '@qj/core-domain'
import { Icon, iconSize, type IconName } from '@/components/icon'
import { CoverBackdrop } from './cover-backdrop'
import { cycleRepeat, setShuffledOrder } from '@/player/controller'
import { type AmbientPalette } from '@/theme/ambient-palette'
import { useThemeColors } from '@/theme/theme-provider'
import { useQueueStyles, type QueueTab } from './queue-shared'

export function ModesHeader({
  palette,
  artwork,
  stageTopOffset,
  stageLeftOffset = 0,
  modesContentOffset,
  scrollY,
  screenWidth,
  screenHeight,
  playMode,
  autoplay,
  tab,
  historyCount,
  upcomingCount,
  provider,
  onTabChange,
  consumeOpenAction,
  onClearHistory,
  onClearUpcoming,
  onToggleAutoplay,
  isLandscape = false,
}: {
  palette?: AmbientPalette
  artwork?: any
  stageTopOffset: number
  stageLeftOffset?: number
  modesContentOffset: number
  scrollY: SharedValue<number>
  screenWidth: number
  screenHeight: number
  playMode: PlayMode
  autoplay: boolean
  tab: QueueTab
  historyCount: number
  upcomingCount: number
  provider: any
  onTabChange: (tab: QueueTab) => void
  consumeOpenAction: () => boolean
  onClearHistory: () => void
  onClearUpcoming: () => void
  onToggleAutoplay: () => void
  isLandscape?: boolean
}) {
  const styles = useQueueStyles()
  const tabLayouts = useRef<{ upcoming?: LayoutRectangle; history?: LayoutRectangle }>({})
  const indicatorX = useSharedValue(isLandscape ? 16 : 24)
  const indicatorOpacity = useSharedValue(1)

  const updateIndicator = useCallback((activeTab: QueueTab, animate = true) => {
    const layout = tabLayouts.current[activeTab]
    if (!layout) return
    const targetX = layout.x + (layout.width - 16) / 2
    if (animate) {
      indicatorX.value = withTiming(targetX, {
        duration: 360,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    } else {
      indicatorX.value = targetX
    }
    indicatorOpacity.value = 1
  }, [])

  useEffect(() => {
    updateIndicator(tab, true)
  }, [tab, updateIndicator])

  const onTabLayout = (t: QueueTab, layout: LayoutRectangle) => {
    tabLayouts.current[t] = layout
    if (t === tab) {
      updateIndicator(t, false)
    }
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    opacity: indicatorOpacity.value,
  }))

  const bgStyle = useAnimatedStyle(() => {
    const currentScreenY = stageTopOffset + Math.max(0, modesContentOffset - scrollY.value)
    return {
      transform: [
        { translateX: -stageLeftOffset },
        { translateY: -currentScreenY },
      ],
    }
  })

  const bgContainerStyle = useAnimatedStyle(() => {
    // scrollY == 0 时背景透明（完全显示屏幕根背景，0色差）；滚动吸顶过程中平滑淡入到 1，作为全屏大背景的严密切片遮挡下方穿透上来的歌曲
    const offset = modesContentOffset > 0 ? modesContentOffset : 24
    const opacity = interpolate(scrollY.value, [0, offset], [0, 1], Extrapolation.CLAMP)
    return { opacity }
  })

  return (
    <View style={[styles.modesHeader, isLandscape && styles.modesHeaderLandscape]}>
      <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, bgContainerStyle]} pointerEvents="none">
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: screenWidth,
              height: screenHeight,
            },
            bgStyle,
          ]}
        >
          <CoverBackdrop artwork={artwork} palette={palette} />
        </Animated.View>
      </Animated.View>
      <View style={styles.modes}>
        <ModeButton
          icon="shuffle"
          label="随机播放"
          active={playMode.shuffle}
          onPress={() => {
            if (consumeOpenAction()) return
            void setShuffledOrder(!playMode.shuffle)
          }}
        />
        <ModeButton
          icon={playMode.repeat === 'one' ? 'repeatOne' : 'repeat'}
          label={playMode.repeat === 'one' ? '单曲循环' : playMode.repeat === 'queue' ? '列表循环' : '顺序播放'}
          active={playMode.repeat !== 'off'}
          onPress={() => {
            if (consumeOpenAction()) return
            void cycleRepeat()
          }}
        />
        {provider?.capabilities.radio ? (
          <ModeButton
            icon="infinity"
            label="无限播放"
            active={autoplay}
            onPress={() => {
              if (consumeOpenAction()) return
              onToggleAutoplay()
            }}
          />
        ) : null}
      </View>
      <View style={styles.queueTabsContainer}>
        <View style={styles.queueTabs} accessibilityRole="tablist">
          <QueueTabButton
            label="继续播放"
            selected={tab === 'upcoming'}
            onPress={() => onTabChange('upcoming')}
            onLayout={(e) => onTabLayout('upcoming', e.nativeEvent.layout)}
          />
          <QueueTabButton
            label="历史记录"
            selected={tab === 'history'}
            onPress={() => onTabChange('history')}
            onLayout={(e) => onTabLayout('history', e.nativeEvent.layout)}
          />
          <View style={styles.queueTabSpacer} />
          {tab === 'history' && historyCount > 0 ? (
            <Pressable
              onPress={onClearHistory}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="清除播放历史"
            >
              <Text style={styles.listClear}>清除</Text>
            </Pressable>
          ) : null}
          {tab === 'upcoming' && upcomingCount > 0 ? (
            <Pressable
              onPress={onClearUpcoming}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="清空待播列表"
            >
              <Text style={styles.listClear}>清空</Text>
            </Pressable>
          ) : null}
        </View>
        <Animated.View style={[styles.queueTabIndicator, indicatorStyle]} />
      </View>
    </View>
  )
}

function QueueTabButton({
  label,
  selected,
  onPress,
  onLayout,
}: {
  label: string
  selected: boolean
  onPress: () => void
  onLayout?: (e: LayoutChangeEvent) => void
}) {
  const styles = useQueueStyles()
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={styles.queueTab}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.queueTabText, selected && styles.queueTabTextActive]}>{label}</Text>
    </Pressable>
  )
}

function ModeButton({ icon, label, active, onPress }: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  const colors = useThemeColors()
  const styles = useQueueStyles()
  return (
    <Pressable
      onPress={onPress}
      style={[styles.mode, active && styles.modeActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `${label}（已开启）` : label}
    >
      <Icon name={icon} size={iconSize.lg} color={active ? colors.bgPrimary : colors.textSecondary} />
    </Pressable>
  )
}
