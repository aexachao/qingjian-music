import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import { Button, Host, Menu, Section } from '@expo/ui/swift-ui'
import { frame, tint } from '@expo/ui/swift-ui/modifiers'
import type { QueueItem } from '@qj/core-domain'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { MarqueeText } from '@/components/marquee-text'
import { ProgressBar } from '@/components/progress-bar'
import { SystemVolumeSlider, addVolumeListener, setSystemVolume } from '../../../modules/system-volume'
import { useEffect } from 'react'
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
    // 切到列表前 18% 柔和淡出；切回封面最后 18% 才柔和淡入（彻底杜绝列表尚未退场时双标题重叠）
    const opacity = interpolate(listAnim.value, [0, 0.18], [1, 0], Extrapolation.CLAMP)
    const maxHeight = interpolate(listAnim.value, [0.05, 0.35], [58, 0], Extrapolation.CLAMP)
    const marginBottom = interpolate(listAnim.value, [0.05, 0.35], [0, -spacing.lg], Extrapolation.CLAMP)
    const translateY = interpolate(listAnim.value, [0, 0.18], [0, 8], Extrapolation.CLAMP)

    return {
      opacity,
      maxHeight,
      marginBottom,
      overflow: 'hidden',
      transform: [{ translateY }],
    }
  })

  return (
    <View style={styles.container}>
      <Animated.View style={titleAnimatedStyle}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            {/* 长歌名装不下就来回滚动，别用省略号把名字截掉 */}
            <MarqueeText text={current.title} style={styles.title} />
            <MarqueeText
              text={`${current.artistText}${current.albumText ? ` — ${current.albumText}` : ''}`}
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
  const volume = useSharedValue(0.5)
  const pressed = useSharedValue(0)
  const initialVolume = useSharedValue(0.5)

  useEffect(() => {
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
      // 假设滑块物理宽度约为屏幕宽度减去两边 icon 和 padding (约 300)
      const delta = event.translationX / 300
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
        <View style={styles.volumeSliderContainer} hitSlop={{ top: 12, bottom: 12 }}>
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
 * 「···」按钮：点开 SwiftUI 原生菜单（@expo/ui）——系统毛玻璃样式、从锚点弹出、
 * 自带触感反馈，destructive 行自动红字。之前是 RN Modal 自绘的，样式追不上系统，
 * 连点按触感都得自己造，换掉。原来头部的「歌名 / 歌词偏移」两行降级成 Section 标题
 * （系统菜单的条目只支持文字 + SF Symbol，塞不进自定义排版）。
 *
 * 注意两条 @expo/ui 的硬规矩（都在模拟器 Release 上实测踩过）：
 * 1. SwiftUI 组件不能直接放在 RN View 里，必须用 <Host> 包一层，否则挂载即崩；
 * 2. 触发器只能用 label 字符串 + systemImage：label 传 ReactNode 会走 Slot 机制，
 *    57.0.16 往 SwiftUIVirtualView 里挂 RN 子视图同样崩（unrecognized selector）。
 */
export function DeckMoreButton({ current }: { current: QueueItem }) {
  const toast = useToast()
  const router = useRouter()
  const { offsetMs, adjust, canAdjust } = useLyricOffset(current.trackId)

  const adjustLyric = (deltaMs: number) => {
    adjust(deltaMs)
    toast(`歌词偏移 ${deltaMs > 0 ? '提前' : '延后'} 0.5 秒`)
  }

  const resetOffset = () => {
    adjust(-offsetMs)
    toast('歌词偏移已归零')
  }

  return (
    // label 留空：只渲染 ellipsis 图标不渲染文字。VoiceOver 会少一个可读名
    // （SwiftUI 菜单按钮的无障碍名来自 label 文本），这是换系统菜单的已知代价。
    <Host matchContents>
      <Menu
        label=""
        systemImage="ellipsis"
        modifiers={[tint(colors.iconMid)]}
      >
      {current.albumId || current.artistId ? (
        <Section title={current.title}>
          {current.albumId ? (
            <Button
              label="查看专辑"
              systemImage="opticaldisc"
              onPress={() => router.replace({ pathname: '/library/album/[id]', params: { id: current.albumId! } })}
            />
          ) : null}
          {current.artistId ? (
            <Button
              label="查看艺术家"
              systemImage="person.crop.circle"
              onPress={() => router.replace({ pathname: '/library/artist/[id]', params: { id: current.artistId! } })}
            />
          ) : null}
        </Section>
      ) : null}
      {canAdjust ? (
        <Section title={`歌词偏移 ${formatOffset(offsetMs)}`}>
          <Button label="歌词提前 0.5 秒" onPress={() => adjustLyric(OFFSET_STEP_MS)} />
          <Button label="歌词延后 0.5 秒" onPress={() => adjustLyric(-OFFSET_STEP_MS)} />
          {offsetMs !== 0 ? <Button label="歌词偏移归零" onPress={resetOffset} /> : null}
        </Section>
      ) : null}
      <Button
        label="清空队列"
        systemImage="trash"
        role="destructive"
        onPress={() => {
          void clearQueue()
          router.back()
        }}
      />
      </Menu>
    </Host>
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
