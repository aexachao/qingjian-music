import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import type { QueueItem } from '@qj/core-domain'
import { IconButton, iconSize } from '@/components/icon'
import { ProgressBar } from '@/components/progress-bar'
import { useToast } from '@/components/toast'
import { useToggleFavorite } from '@/lib/favorites'
import { skipToNextSafe, skipToPreviousSmart, togglePlay } from '@/player/controller'
import { colors, spacing, typography } from '@/theme/tokens'

interface PlayerDeckProps {
  current: QueueItem
  /** 点「···」打开快捷菜单，菜单里要跳页面，所以由页面提供 */
  onMore: () => void
}

/**
 * 播放页下半部分：歌名行（右侧「喜欢」「···」）+ 进度条 + 传输控制。
 * 封面页和歌词页共用它，两页只有上半部分不同。
 */
export function PlayerDeck({ current, onMore }: PlayerDeckProps) {
  const { playing } = useIsPlaying()
  const progress = useProgress(500)
  const toggleFavorite = useToggleFavorite()
  const toast = useToast()

  /** 收藏是「无声」的服务端操作，必须给一句提示 */
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
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text numberOfLines={1} style={styles.title}>
            {current.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {current.artistText}
            {current.albumText ? ` — ${current.albumText}` : ''}
          </Text>
        </View>
        {/* 从右往左：「···」「喜欢」 */}
        <IconButton
          name="heart"
          size={iconSize.lg}
          color={current.isFavorite ? colors.like : colors.iconMid}
          filled={current.isFavorite}
          onPress={() => void onToggleFavorite()}
          accessibilityLabel={current.isFavorite ? '取消收藏' : '收藏'}
        />
        <IconButton
          name="more"
          size={iconSize.lg}
          color={colors.iconMid}
          onPress={onMore}
          accessibilityLabel="更多操作"
        />
      </View>

      <ProgressBar
        position={progress.position}
        duration={progress.duration > 0 ? progress.duration : current.durationMs / 1000}
        onSeek={(seconds) => void TrackPlayer.seekTo(seconds)}
      />

      {/* 传输控制：大字形、无圆形底，对齐 Apple Music */}
      <View style={styles.controls}>
        <IconButton
          name="previous"
          size={iconSize.xxl}
          color={colors.textPrimary}
          onPress={() => void skipToPreviousSmart()}
          accessibilityLabel="上一首"
          style={styles.controlHit}
        />
        <IconButton
          name={playing ? 'pause' : 'play'}
          size={iconSize.hero}
          color={colors.textPrimary}
          onPress={() => void togglePlay()}
          accessibilityLabel={playing ? '暂停' : '播放'}
          style={styles.controlHit}
        />
        <IconButton
          name="next"
          size={iconSize.xxl}
          color={colors.textPrimary}
          onPress={() => void skipToNextSafe()}
          accessibilityLabel="下一首"
          style={styles.controlHit}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  // 歌名占满剩余宽度，两个图标按钮自然贴到行尾
  titleText: { flex: 1, gap: 2, paddingRight: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary },
  artist: { ...typography.callout, color: colors.textSecondary },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxl },
  /** 大字形需要更大的命中区，56 的图标不能只给 44 */
  controlHit: { minWidth: 64, minHeight: 64 },
})
