import { useCallback, useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import type { QueueItem } from '@qj/core-domain'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { MarqueeText } from '@/components/marquee-text'
import { ProgressBar } from '@/components/progress-bar'
import { SystemVolumeSlider, addVolumeListener, getSystemVolume, setSystemVolume } from '../../../modules/system-volume'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
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
import { useToggleFavorite } from '@/lib/favorites'
import { formatOffset, OFFSET_STEP_MS, useLyricOffset } from '@/lib/lyric-offset'
import { clearQueue, skipToNextSafe, skipToPreviousSmart, togglePlay } from '@/player/controller'
import { usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

interface PlayerDeckProps {
  current: QueueItem
  listAnim?: SharedValue<number>
}

/**
 * 播放页下半部分：歌名行（右侧「喜欢」「···」）+ 进度条 + 传输控制 + 音量条。
 * 封面页和歌词页共用它，两页只有上半部分不同。
 * 「···」的快捷菜单在这个按钮上方浮现（对齐 iOS 上下文菜单的位置）。
 */
export function PlayerDeck({ current, listAnim }: PlayerDeckProps) {
  const { playing } = useIsPlaying()
  const progress = useProgress(500)
  const playbackEnded = usePlayerStore((s) => s.playbackEnded)
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

  const titleAnimatedStyle = useAnimatedStyle(() => {
    if (!listAnim) return {}
    const opacity = interpolate(listAnim.value, [0, 0.35], [1, 0], Extrapolation.CLAMP)
    const maxHeight = interpolate(listAnim.value, [0.1, 0.9], [58, 0], Extrapolation.CLAMP)
    const marginBottom = interpolate(listAnim.value, [0.1, 0.9], [0, -spacing.lg], Extrapolation.CLAMP)

    return {
      opacity,
      maxHeight,
      marginBottom,
      overflow: 'hidden',
    }
  })

  const duration = progress.duration > 0 ? progress.duration : current.durationMs / 1000
  const position = playbackEnded ? duration : progress.position

  return (
    <View style={styles.container}>
      <Animated.View style={titleAnimatedStyle}>
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
              filled={current.isFavorite}
              onPress={() => void onToggleFavorite()}
              accessibilityLabel={current.isFavorite ? '取消收藏' : '收藏'}
            />
            <View style={styles.menuWrapper}>
              <DeckMoreButton current={current} />
            </View>
          </View>
        </View>
      </Animated.View>

      <ProgressBar
        position={position}
        duration={duration}
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
          onPress={() => void skipToPreviousSmart()}
          accessibilityLabel="上一首"
          style={styles.sideControlHit}
        />
        <IconButton
          name={playing ? 'pause' : 'play'}
          size={iconSize.hero}
          color={colors.textPrimary}
          onPress={() => void togglePlay()}
          accessibilityLabel={playing ? '暂停' : '播放'}
          style={styles.playControlHit}
        />
        <IconButton
          name="next"
          size={iconSize.xxl}
          color={colors.textPrimary}
          onPress={() => void skipToNextSafe()}
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
      runOnJS(Haptics.selectionAsync)()
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
  * 「···」使用受控 RN Modal：遮罩会独占触摸，点击菜单外只关闭菜单，不会继续触发底层切歌、滚动或页面下拉。
 */
export function DeckMoreButton({ current, onBeforeOpen }: { current: QueueItem; onBeforeOpen?: () => boolean }) {
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { offsetMs, adjust, canAdjust } = useLyricOffset(current.trackId)

  const closeAndRun = useCallback((action: () => void) => {
    setOpen(false)
    action()
  }, [])

  const adjustLyric = (deltaMs: number) => {
    adjust(deltaMs)
    toast(`歌词偏移 ${deltaMs > 0 ? '提前' : '延后'} 0.5 秒`)
  }

  const resetOffset = () => {
    adjust(-offsetMs)
    toast('歌词偏移已归零')
  }

  return (
    <>
      <IconButton
        name="more"
        size={iconSize.lg}
        color={colors.iconMid}
        onPress={() => {
          if (onBeforeOpen?.()) return
          setOpen(true)
        }}
        accessibilityLabel="更多快捷操作"
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.menuScrim}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="关闭快捷操作"
          />
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle} numberOfLines={1}>{current.title}</Text>
            {current.albumId ? (
              <MenuAction label="查看专辑" onPress={() => closeAndRun(() => router.replace({ pathname: '/library/album/[id]', params: { id: current.albumId! } }))} />
            ) : null}
            {current.artistId ? (
              <MenuAction label="查看艺术家" onPress={() => closeAndRun(() => router.replace({ pathname: '/library/artist/[id]', params: { id: current.artistId! } }))} />
            ) : null}
            {canAdjust ? (
              <>
                <Text style={styles.menuSection}>歌词偏移 {formatOffset(offsetMs)}</Text>
                <MenuAction label="歌词提前 0.5 秒" onPress={() => closeAndRun(() => adjustLyric(OFFSET_STEP_MS))} />
                <MenuAction label="歌词延后 0.5 秒" onPress={() => closeAndRun(() => adjustLyric(-OFFSET_STEP_MS))} />
                {offsetMs !== 0 ? <MenuAction label="歌词偏移归零" onPress={() => closeAndRun(resetOffset)} /> : null}
              </>
            ) : null}
            <MenuAction
              label="清空队列"
              destructive
              onPress={() => closeAndRun(() => {
                void clearQueue()
                router.back()
              })}
            />
          </View>
        </View>
      </Modal>
    </>
  )
}

function MenuAction({ label, destructive = false, onPress }: { label: string; destructive?: boolean; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.menuAction, pressed && styles.menuActionPressed]} onPress={onPress}>
      <Text style={[styles.menuActionText, destructive && styles.menuActionDestructive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  // 歌名占满剩余宽度，两个图标按钮自然贴到行尾
  titleText: { flex: 1, gap: 2, paddingRight: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary },
  artist: { ...typography.callout, color: colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  // 两个图标容器严格等大 (44x44)，依赖 Flex 居中对齐，去掉之前的偏移和缩放
  menuWrapper: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  menuScrim: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  menuCard: {
    backgroundColor: colors.bgModal,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
  },
  menuTitle: { ...typography.callout, color: colors.textSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  menuSection: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  menuAction: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  menuActionPressed: { backgroundColor: colors.bgCardHover },
  menuActionText: { ...typography.body, color: colors.textPrimary },
  menuActionDestructive: { color: colors.danger },
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
})
