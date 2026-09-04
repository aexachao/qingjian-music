import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import { CoverImage } from '@/components/cover-image'
import { LyricView } from '@/components/lyric-view'
import { ProgressBar } from '@/components/progress-bar'
import { useToggleFavorite } from '@/lib/favorites'
import { cycleRepeat, skipToNextSafe, skipToPreviousSmart, togglePlay, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

const REPEAT_LABEL = { off: '⇢', queue: '🔁', one: '🔂' } as const

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
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="收起播放页">
          <Text style={styles.handle}>▾</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.source}>
          {source?.label ?? '正在播放'}
        </Text>
        <View style={styles.handleSpacer} />
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
        <Pressable onPress={() => void skipToPreviousSmart()} hitSlop={12} accessibilityRole="button" accessibilityLabel="上一首">
          <Text style={styles.sideControl}>⏮</Text>
        </Pressable>
        <Pressable
          onPress={() => void togglePlay()}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={playing ? '暂停' : '播放'}
          style={styles.playButton}
        >
          <Text style={styles.playIcon}>{playing ? '⏸' : '▶'}</Text>
        </Pressable>
        <Pressable onPress={() => void skipToNextSafe()} hitSlop={12} accessibilityRole="button" accessibilityLabel="下一首">
          <Text style={styles.sideControl}>⏭</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            void toggleFavorite(current.trackId, !current.isFavorite)
          }}
          accessibilityRole="button"
          accessibilityLabel={current.isFavorite ? '取消收藏' : '收藏'}
        >
          <Text style={[styles.footerIcon, current.isFavorite && styles.footerIconActive]}>
            {current.isFavorite ? '♥' : '♡'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void toggleShuffle()}
          accessibilityRole="button"
          accessibilityLabel={playMode.shuffle ? '关闭随机播放' : '开启随机播放'}
        >
          <Text style={[styles.footerIcon, playMode.shuffle && styles.footerIconActive]}>🔀</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowLyrics((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={showLyrics ? '显示封面' : '显示歌词'}
        >
          <Text style={[styles.footerLabel, showLyrics && styles.footerIconActive]}>歌词</Text>
        </Pressable>
        <Pressable
          onPress={() => void cycleRepeat()}
          accessibilityRole="button"
          accessibilityLabel="切换循环模式"
        >
          <Text style={[styles.footerIcon, playMode.repeat !== 'off' && styles.footerIconActive]}>
            {REPEAT_LABEL[playMode.repeat]}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push('/queue')} accessibilityRole="button" accessibilityLabel="查看播放队列">
          <Text style={styles.footerIcon}>☰</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, gap: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { ...typography.subhead, color: colors.textSecondary },
  link: { ...typography.headline, color: colors.accent },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  handle: { fontSize: 22, color: colors.textSecondary, width: 32 },
  handleSpacer: { width: 32 },
  source: { ...typography.footnote, color: colors.textSecondary, flex: 1, textAlign: 'center' },
  artWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: { gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  artist: { ...typography.callout, color: colors.textSecondary },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxl },
  sideControl: { fontSize: 30, color: colors.text },
  playButton: { width: 72, alignItems: 'center' },
  playIcon: { fontSize: 44, color: colors.text },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  footerIcon: { fontSize: 20, color: colors.textTertiary },
  footerLabel: { ...typography.subhead, color: colors.textTertiary },
  footerIconActive: { color: colors.accent },
})
