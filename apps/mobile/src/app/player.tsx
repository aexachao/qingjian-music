import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import type { RepeatMode } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { IconButton, iconSize, type IconName } from '@/components/icon'
import { LyricView } from '@/components/lyric-view'
import { ProgressBar } from '@/components/progress-bar'
import { useToggleFavorite } from '@/lib/favorites'
import { cycleRepeat, skipToNextSafe, skipToPreviousSmart, togglePlay, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 三种循环模式对应的图标、颜色与读屏文案：关闭是灰的，开启用强调色 */
const REPEAT_MODES: Record<RepeatMode, { icon: IconName; color: string; text: string }> = {
  off: { icon: 'repeat', color: colors.iconMid, text: '关闭' },
  queue: { icon: 'repeat', color: colors.accent, text: '列表循环' },
  one: { icon: 'repeatOne', color: colors.accent, text: '单曲循环' },
}

/** 正在播放页：封面左右滑动切歌、歌词整屏切换，交互对齐 Apple Music */
export default function PlayerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const current = usePlayerStore(selectCurrent)
  const source = usePlayerStore((state) => state.source)
  const playMode = usePlayerStore((state) => state.playMode)
  const { playing } = useIsPlaying()
  const progress = useProgress(500)
  const [showLyrics, setShowLyrics] = useState(false)
  const toggleFavorite = useToggleFavorite()

  const artSize = Math.min(width - spacing.xl * 2, 420)
  const translateX = useSharedValue(0)
  const repeatMode = REPEAT_MODES[playMode.repeat]

  const commitSwipe = useCallback((direction: 1 | -1) => {
    if (direction === 1) void skipToNextSafe()
    else void skipToPreviousSmart()
  }, [])

  const swipe = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-24, 24])
    .onUpdate((event) => {
      translateX.value = event.translationX
    })
    .onEnd((event) => {
      const threshold = width * 0.25
      if (Math.abs(event.translationX) > threshold) {
        runOnJS(commitSwipe)(event.translationX < 0 ? 1 : -1)
      }
      translateX.value = withTiming(0, { duration: 180 })
    })

  const artStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

  if (!current) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.empty}>还没有正在播放的歌曲</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>返回</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.header}>
        <IconButton
          name="back"
          size={iconSize.lg}
          color={colors.iconMid}
          onPress={() => router.back()}
          accessibilityLabel="返回"
        />
        <Text numberOfLines={1} style={styles.source}>
          {source?.label ?? '正在播放'}
        </Text>
        {/* 与左侧收起按钮同宽，标题才是真正居中的 */}
        <View style={styles.headerSpacer} />
      </View>

      {showLyrics ? (
        <LyricView
          trackId={current.trackId}
          positionMs={progress.position * 1000}
          onSeek={(seconds) => void TrackPlayer.seekTo(seconds)}
        />
      ) : (
        <View style={styles.artWrapper}>
          <GestureDetector gesture={swipe}>
            <Animated.View style={artStyle}>
              <CoverImage resource={current.artwork} size={artSize} borderRadius={radius.lg} />
            </Animated.View>
          </GestureDetector>
        </View>
      )}

      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.title}>
          {current.title}
        </Text>
        <Text numberOfLines={1} style={styles.artist}>
          {current.artistText}
          {current.albumText ? ` — ${current.albumText}` : ''}
        </Text>
      </View>

      <ProgressBar
        position={progress.position}
        duration={progress.duration > 0 ? progress.duration : current.durationMs / 1000}
        onSeek={(seconds) => void TrackPlayer.seekTo(seconds)}
      />

      <View style={styles.controls}>
        <IconButton
          name="previous"
          size={iconSize.xl}
          filled
          color={colors.iconMid}
          onPress={() => void skipToPreviousSmart()}
          accessibilityLabel="上一首"
        />
        {/* 主控制：图标只到 xl，靠圆形底色把播放/暂停做成视觉重心；传输控制统一实心 */}
        <IconButton
          name={playing ? 'pause' : 'play'}
          size={iconSize.xl}
          filled
          color={colors.textPrimary}
          onPress={() => void togglePlay()}
          accessibilityLabel={playing ? '暂停' : '播放'}
          style={styles.playButton}
        />
        <IconButton
          name="next"
          size={iconSize.xl}
          filled
          color={colors.iconMid}
          onPress={() => void skipToNextSafe()}
          accessibilityLabel="下一首"
        />
      </View>

      <View style={styles.footer}>
        <IconButton
          name="heart"
          size={iconSize.lg}
          color={current.isFavorite ? colors.like : colors.iconMid}
          filled={current.isFavorite}
          onPress={() => {
            void toggleFavorite(current.trackId, !current.isFavorite)
          }}
          accessibilityLabel={current.isFavorite ? '取消收藏' : '收藏'}
        />
        <IconButton
          name="shuffle"
          size={iconSize.lg}
          color={playMode.shuffle ? colors.accent : colors.iconMid}
          onPress={() => void toggleShuffle()}
          accessibilityLabel={playMode.shuffle ? '关闭随机播放' : '开启随机播放'}
        />
        <IconButton
          name="lyrics"
          size={iconSize.lg}
          color={showLyrics ? colors.accent : colors.iconMid}
          onPress={() => setShowLyrics((value) => !value)}
          accessibilityLabel={showLyrics ? '显示封面' : '显示歌词'}
        />
        <IconButton
          name={repeatMode.icon}
          size={iconSize.lg}
          color={repeatMode.color}
          onPress={() => void cycleRepeat()}
          accessibilityLabel={`切换循环模式，当前${repeatMode.text}`}
        />
        <IconButton
          name="queue"
          size={iconSize.lg}
          color={colors.iconMid}
          onPress={() => router.push('/queue')}
          accessibilityLabel="查看播放队列"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, paddingHorizontal: spacing.xl, gap: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { ...typography.subhead, color: colors.textSecondary },
  link: { ...typography.headline, color: colors.accent },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 44 },
  source: { ...typography.footnote, color: colors.textSecondary, flex: 1, textAlign: 'center' },
  artWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: { gap: spacing.xs },
  title: { ...typography.title, color: colors.textPrimary },
  artist: { ...typography.callout, color: colors.textSecondary },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  playButton: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.bgButtonSecondary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lyricsButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  footerLabel: { ...typography.subhead, color: colors.textSecondary },
  footerLabelActive: { color: colors.accent },
})
