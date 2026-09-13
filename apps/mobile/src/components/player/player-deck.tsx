import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import type { QueueItem } from '@qj/core-domain'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { MarqueeText } from '@/components/marquee-text'
import { ProgressBar } from '@/components/progress-bar'
import { TrackMenuButton } from '@/components/track-menu-button'
import { SystemVolumeSlider, addVolumeListener, getSystemVolume, setSystemVolume } from '../../../modules/system-volume'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useToast } from '@/components/toast'
import { formatAudioSourceInfo } from '@/lib/audio-info'
import { useToggleFavorite } from '@/lib/favorites'
import { select, tap } from '@/lib/haptics'
import { skipToNextSafe, skipToPreviousSmart, togglePlay } from '@/player/controller'
import { usePlayerStore } from '@/player/store'
import { useIsAudioLoading } from '@/player/use-audio-loading'
import { radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

interface PlayerDeckProps {
  current: QueueItem
  listAnim?: SharedValue<number>
  hideTitle?: boolean
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
}

export interface PlayerTitleRowProps {
  current: QueueItem
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
}

export function PlayerTitleRow({
  current,
  onDismissWithAction,
  onMenuOpenChange,
}: PlayerTitleRowProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const toggleFavorite = useToggleFavorite()
  const toast = useToast()

  const onToggleFavorite = useCallback(async () => {
    const next = !current.isFavorite
    try {
      await toggleFavorite(current.trackId, next)
      toast(next ? '已添加到我喜欢的音乐' : '已从我喜欢的音乐移除')
    } catch {
      toast('操作失败，请稍后再试')
    }
  }, [current, toast, toggleFavorite])

  return (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        {/* 长歌名装不下就来回滚动，别用省略号把名字截掉 */}
        <MarqueeText text={current.title} style={styles.title} />
        <MarqueeText
          text={current.artistText}
          style={styles.artist}
        />
      </View>
      <View style={styles.actions}>
        <IconButton
          name="heart"
          size={iconSize.xl}
          color={current.isFavorite ? colors.like : colors.iconMid}
          filled={true}
          onPress={() => void onToggleFavorite()}
          accessibilityLabel={current.isFavorite ? '取消收藏' : '收藏'}
        />
        <View style={styles.menuWrapper}>
          <DeckMoreButton
            current={current}
            onDismissWithAction={onDismissWithAction}
            onMenuOpenChange={onMenuOpenChange}
          />
        </View>
      </View>
    </View>
  )
}

/**
 * 播放页下半部分：歌名行（右侧「喜欢」「···」）+ 进度条 + 传输控制 + 音量条。
 * 封面页和歌词页共用它，两页只有上半部分不同。
 * 「···」的快捷菜单在这个按钮上方浮现（对齐 iOS 上下文菜单的位置）。
 */
export function PlayerDeck({
  current,
  listAnim,
  hideTitle = false,
  onDismissWithAction,
  onMenuOpenChange,
}: PlayerDeckProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const { playing } = useIsPlaying()
  const isAudioLoading = useIsAudioLoading()
  const audioSourceInfo = useMemo(() => formatAudioSourceInfo(current), [current])
  const progress = useProgress(500)
  const playbackEnded = usePlayerStore((s) => s.playbackEnded)

  const titleAnimatedStyle = useAnimatedStyle(() => {
    if (!listAnim) return {}
    const opacity = interpolate(listAnim.value, [0, 0.35], [1, 0], Extrapolation.CLAMP)
    const translateY = interpolate(listAnim.value, [0, 0.35], [0, -10], Extrapolation.CLAMP)

    return {
      opacity,
      transform: [{ translateY }],
    }
  })

  const duration = progress.duration > 0 ? progress.duration : current.durationMs / 1000
  const position = playbackEnded ? duration : progress.position

  return (
    <View style={styles.container}>
      {!hideTitle ? (
        <Animated.View style={titleAnimatedStyle}>
          <PlayerTitleRow
            current={current}
            onDismissWithAction={onDismissWithAction}
            onMenuOpenChange={onMenuOpenChange}
          />
        </Animated.View>
      ) : null}

      <ProgressBar
        position={position}
        duration={duration}
        centerLabel={audioSourceInfo}
        onSeek={(seconds) => {
          usePlayerStore.getState().setPlaybackEnded(false)
          void TrackPlayer.seekTo(seconds)
        }}
      />

      {/* 传输控制：大字形、无圆形底，对齐 Apple Music */}
      <View style={styles.controls}>
        <IconButton
          name="previous"
          size={iconSize.xxl}
          color={colors.textPrimary}
          onPress={() => {
            tap()
            void skipToPreviousSmart()
          }}
          accessibilityLabel="上一首"
          style={styles.sideControlHit}
        />
        <IconButton
          name={playing ? 'pause' : 'play'}
          size={iconSize.hero}
          color={colors.textPrimary}
          loading={isAudioLoading}
          onPress={() => {
            tap()
            void togglePlay()
          }}
          accessibilityLabel={playing ? '暂停' : '播放'}
          style={styles.playControlHit}
        />
        <IconButton
          name="next"
          size={iconSize.xxl}
          color={colors.textPrimary}
          onPress={() => {
            tap()
            void skipToNextSafe()
          }}
          accessibilityLabel="下一首"
          style={styles.sideControlHit}
        />
      </View>

      <VolumeBar />
    </View>
  )
}

/**
 * 自绘音量条：完美的 Apple Music 胶囊外观，左右图标在胶囊内部。
 * 利用透明的 SystemVolumeSlider 拦截手势并抑制系统音量弹窗。
 */
function VolumeBar() {
  const colors = useThemeColors()
  const styles = useStyles()
  const currentVol = getSystemVolume()
  const volume = useSharedValue(currentVol)
  const pressed = useSharedValue(0)
  const initialVolume = useSharedValue(currentVol)
  const sliderWidth = useSharedValue(300)

  useEffect(() => {
    // 挂载时立即拉取真实系统音量校准
    const latest = getSystemVolume()
    if (pressed.value === 0 && Math.abs(volume.value - latest) > 0.005) {
      volume.value = latest
    }
    const sub = addVolumeListener((e) => {
      // 只有在没被按住的时候，才接受系统音量变化
      if (pressed.value === 0) {
        volume.value = withSpring(e.volume, { damping: 34.6, stiffness: 300 })
      }
    })
    return () => sub.remove()
  }, [volume, pressed])

  const pan = Gesture.Pan()
    .failOffsetY([-14, 14])
    .onBegin(() => {
      runOnJS(select)()
      pressed.value = withSpring(1, { damping: 34.6, stiffness: 300 })
      initialVolume.value = volume.value
    })
    .onChange((event) => {
      const width = sliderWidth.value || 300
      const delta = event.translationX / width
      let next = initialVolume.value + delta
      next = Math.max(0, Math.min(1, next))
      volume.value = next
      runOnJS(setSystemVolume)(next)
    })
    .onFinalize(() => {
      pressed.value = withTiming(0, { duration: 250 })
    })

  const trackStyle = useAnimatedStyle(() => ({
    height: 6 + (6 * 3 - 6) * pressed.value,
  }))

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, volume.value)) * 100}%`,
    height: '100%',
  }))

  return (
    <View style={styles.volumeRow}>
      <Icon name="volumeDown" size={iconSize.md} color={colors.iconDim} />
      
      <GestureDetector gesture={pan}>
        <View
          style={styles.volumeSliderContainer}
          hitSlop={{ top: 12, bottom: 12 }}
          onLayout={(e) => {
            sliderWidth.value = e.nativeEvent.layout.width
          }}
        >
          <Animated.View style={[styles.volumeTrack, trackStyle]}>
            <Animated.View style={[styles.volumeFill, fillStyle]} />
          </Animated.View>

          {/* 纯粹用于抑制系统音量 HUD 的幽灵视图，没有实际 UI 和交互 */}
          <SystemVolumeSlider pointerEvents="none" style={StyleSheet.absoluteFill} />
        </View>
      </GestureDetector>

      <Icon name="volumeUp" size={iconSize.md} color={colors.iconDim} />
    </View>
  )
}

/**
 * 「···」按钮 + 系统原生快捷菜单 (iOS: UIContextMenu / Android: PopupMenu)。
 */
export function DeckMoreButton({
  current,
  onBeforeOpen,
  onDismissWithAction,
  onMenuOpenChange,
  popDirection = 'up',
}: {
  current: QueueItem
  onBeforeOpen?: () => boolean
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
  popDirection?: 'up' | 'down'
}) {
  return (
    <TrackMenuButton
      variant="iconButton"
      context="current"
      popDirection={popDirection}
      onBeforeOpen={onBeforeOpen}
      onMenuOpenChange={onMenuOpenChange}
      onNavigate={onDismissWithAction}
      accessibilityLabel="更多快捷操作"
      subject={{
        trackId: current.trackId,
        title: current.title,
        artistText: current.artistText,
        ...(current.albumId ? { albumId: current.albumId } : {}),
        ...(current.albumText ? { albumText: current.albumText } : {}),
        ...(current.artistId ? { artistId: current.artistId } : {}),
        durationMs: current.durationMs,
        ...(current.isFavorite === undefined ? {} : { isFavorite: current.isFavorite }),
      }}
    />
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: { gap: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  // 歌名占满剩余宽度，两个图标按钮自然贴到行尾
  titleText: { flex: 1, gap: 2, paddingRight: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary },
  artist: { ...typography.callout, color: colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  // 两个图标容器严格等大 (44x44)，依赖 Flex 居中对齐，去掉之前的偏移和缩放
  menuWrapper: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  playControlHit: { minWidth: 88, minHeight: 88, borderRadius: 44 },
  sideControlHit: { minWidth: 72, minHeight: 72, borderRadius: 36 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  volumeSliderContainer: {
    flex: 1,
    height: 32, // Apple Music 原生音量滑块高度，确保响应区域和视觉居中
    justifyContent: 'center',
    position: 'relative',
  },
  volumeTrack: {
    backgroundColor: colors.playerProgressTrack,
    borderRadius: radius.pill,
    overflow: 'hidden',
    height: 6, // 默认细度，与进度条对齐
  },
  volumeFill: {
    backgroundColor: colors.playerProgressFill,
  },
}))
