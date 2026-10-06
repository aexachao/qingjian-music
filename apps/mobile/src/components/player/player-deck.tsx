import { usePlaybackIntent } from '@/player/playback-intent'
import { useCallback, useMemo } from 'react'
import { View } from 'react-native'
import { useIsPlaying, useProgress } from 'react-native-track-player'
import type { QueueItem } from '@qj/core-domain'
import { IconButton, iconSize } from '@/components/icon'
import { MarqueeText } from '@/components/marquee-text'
import { ProgressBar } from '@/components/progress-bar'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import { useToast } from '@/components/toast'
import { formatAudioSourceInfo } from '@/lib/audio-info'
import { useToggleFavorite } from '@/lib/favorites'
import { tap } from '@/lib/haptics'
import { seekPlayback, skipToNextSafe, skipToPreviousSmart, togglePlay } from '@/player/controller'
import { usePlayerStore } from '@/player/store'
import { useIsAudioLoading } from '@/player/use-audio-loading'
import { spacing } from '@/theme/tokens'
import { useThemeColors } from '@/theme/theme-provider'
import { useStyles } from './player-deck.styles'
import { DeckMoreButton } from './deck-more-button'
import { VolumeBar } from './deck-volume-bar'

// DeckMoreButton 拆到独立文件后仍从本模块转出，current-track-card 等调用方 import 路径不变。
export { DeckMoreButton } from './deck-more-button'

interface PlayerDeckProps {
  current: QueueItem
  listAnim?: SharedValue<number>
  hideTitle?: boolean
  /** 列表态：完全卸载音量条（连同透明 MPVolumeView 一起），腾高给 list；
   * 卸载后 iOS 交还系统音量 HUD（按音量键弹原生指示条） */
  hideVolume?: boolean
  compact?: boolean
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
  /** Optional action bridge used by the immersive lyric chrome. */
  onAction?: (action: () => Promise<unknown>, fallback: string) => void
  onInteractionStart?: () => void
  onInteractionEnd?: () => void
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
  const toast = useToast()
  const toggleFavorite = useToggleFavorite()

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
  hideVolume = false,
  compact = false,
  onDismissWithAction,
  onMenuOpenChange,
  onAction,
  onInteractionStart,
  onInteractionEnd,
}: PlayerDeckProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const toast = useToast()
  const { playing } = useIsPlaying()
  const networkWaiting = usePlaybackIntent((s) => s.waitingForNetwork)
  const isAudioLoading = useIsAudioLoading()
  const audioSourceInfo = useMemo(() => formatAudioSourceInfo(current), [current])
  const progress = useProgress(500)
  const playbackEnded = usePlayerStore((s) => s.playbackEnded)
  const selectionPending = usePlayerStore((s) => Boolean(s.pendingCurrent))

  const titleAnimatedStyle = useAnimatedStyle(() => {
    if (!listAnim) return {}
    const opacity = interpolate(listAnim.value, [0, 0.35], [1, 0], Extrapolation.CLAMP)
    const translateY = interpolate(listAnim.value, [0, 0.35], [0, -10], Extrapolation.CLAMP)

    return {
      opacity,
      transform: [{ translateY }],
    }
  })

  // 音量条平滑折叠动画：随 listAnim 平滑收缩高度与淡出，消除切列表时的瞬间掉帧与布局塌陷
  const volumeAnimatedStyle = useAnimatedStyle(() => {
    if (!listAnim) return {}
    const height = interpolate(listAnim.value, [0, 0.8], [36, 0], Extrapolation.CLAMP)
    const opacity = interpolate(listAnim.value, [0, 0.35], [1, 0], Extrapolation.CLAMP)
    const marginTop = interpolate(listAnim.value, [0, 0.8], [0, -spacing.lg], Extrapolation.CLAMP)
    return {
      height,
      opacity,
      marginTop,
      overflow: 'hidden',
    }
  })

  const duration = !selectionPending && progress.duration > 0 ? progress.duration : current.durationMs / 1000
  const position = selectionPending ? 0 : playbackEnded ? duration : progress.position

  const history = usePlayerStore((s) => s.history)
  const queue = usePlayerStore((s) => s.queue)
  const index = usePlayerStore((s) => s.index)
  const autoplay = usePlayerStore((s) => s.autoplay)
  const repeatMode = usePlayerStore((s) => s.playMode.repeat)

  const upcomingCount = index >= 0 ? queue.length - index - 1 : Math.max(0, queue.length - 1)
  const isLooping = repeatMode !== 'off'
  const canGoPrevious = history.length > 0
  const canGoNext = autoplay || isLooping || upcomingCount > 0
  const runAction = (action: () => Promise<unknown>, fallback: string) => {
    tap()
    if (onAction) onAction(action, fallback)
    else void action().catch((error: unknown) => toast(error instanceof Error ? error.message : fallback))
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
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
        onInteractionStart={onInteractionStart}
        onInteractionEnd={onInteractionEnd}
        onSeek={(seconds) => {
          usePlayerStore.getState().setPlaybackEnded(false)
          const action = () => seekPlayback(seconds)
          if (onAction) onAction(action, '调整进度失败，请重试')
          else void action().catch(() => toast('调整进度失败，请重试'))
        }}
      />

      {/* 传输控制：大字形、无圆形底，对齐 Apple Music */}
      <View style={[styles.controls, compact && styles.controlsCompact]}>
        <IconButton
          name="previous"
          size={compact ? iconSize.xxl : iconSize.xxl}
          color={canGoPrevious ? colors.textPrimary : colors.textTertiary}
          disabled={!canGoPrevious}
          onPress={() => runAction(skipToPreviousSmart, '切换上一首失败，请重试')}
          accessibilityLabel="上一首"
          style={compact ? styles.sideControlHitCompact : styles.sideControlHit}
        />
        <IconButton
          name={playing || networkWaiting ? 'pause' : 'play'}
          size={compact ? iconSize.hero : iconSize.hero}
          color={colors.textPrimary}
          loading={isAudioLoading && !networkWaiting}
          onPress={() => runAction(togglePlay, '播放操作失败，请重试')}
          accessibilityLabel={networkWaiting ? '取消网络恢复后续播' : playing ? '暂停' : '播放'}
          style={compact ? styles.playControlHitCompact : styles.playControlHit}
        />
        <IconButton
          name="next"
          size={compact ? iconSize.xxl : iconSize.xxl}
          color={canGoNext ? colors.textPrimary : colors.textTertiary}
          disabled={!canGoNext}
          onPress={() => runAction(skipToNextSafe, '切换下一首失败，请重试')}
          accessibilityLabel="下一首"
          style={compact ? styles.sideControlHitCompact : styles.sideControlHit}
        />
      </View>

      {/* 音量条：利用 Animated.View 平滑折叠收缩高度，避免瞬间卸载造成的 Layout Shift */}
      <Animated.View
        style={volumeAnimatedStyle}
        pointerEvents={hideVolume ? 'none' : 'auto'}
      >
        <VolumeBar onInteractionStart={onInteractionStart} onInteractionEnd={onInteractionEnd} />
      </Animated.View>
    </View>
  )
}
