import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, Share, StyleSheet, Text, View } from 'react-native'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import { useRouter } from 'expo-router'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import type { QueueItem } from '@qj/core-domain'
import { Icon, IconButton, iconSize, type IconName } from '@/components/icon'
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
import { useDetailHref } from '@/lib/detail-href'
import { useToast } from '@/components/toast'
import { formatAudioSourceInfo } from '@/lib/audio-info'
import { useToggleFavorite } from '@/lib/favorites'
import { skipToNextSafe, skipToPreviousSmart, togglePlay } from '@/player/controller'
import { usePlayerStore } from '@/player/store'
import { useIsAudioLoading } from '@/player/use-audio-loading'
import { colors, radius, spacing, typography } from '@/theme/tokens'

interface PlayerDeckProps {
  current: QueueItem
  listAnim?: SharedValue<number>
  hideTitle?: boolean
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
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
  const { playing } = useIsPlaying()
  const isAudioLoading = useIsAudioLoading()
  const audioSourceInfo = useMemo(() => formatAudioSourceInfo(current), [current])
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
      {!hideTitle ? (
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
          onPress={() => void skipToPreviousSmart()}
          accessibilityLabel="上一首"
          style={styles.sideControlHit}
        />
        <IconButton
          name={playing ? 'pause' : 'play'}
          size={iconSize.hero}
          color={colors.textPrimary}
          loading={isAudioLoading}
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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const toast = useToast()
  const router = useRouter()
  const href = useDetailHref()

  const dismissAndNavigate = (navigateAction: () => void) => {
    setIsMenuOpen(false)
    onMenuOpenChange?.(false)
    if (onDismissWithAction) {
      onDismissWithAction(navigateAction)
    } else {
      router.back()
      setTimeout(navigateAction, 320)
    }
  }

  const actions = useMemo<MenuAction[]>(() => {
    if (Platform.OS === 'ios') {
      if (popDirection === 'down') {
        // 向下弹出（如队列顶部的卡片）：UIKit 从锚点（顶部）由近及远向下排列，第 0 项在最顶端
        return [
          {
            id: 'group-playlist',
            title: '',
            displayInline: true,
            subactions: [
              {
                id: 'add-to-playlist',
                title: '添加到歌单',
                image: 'plus.circle',
                imageColor: '#ffffff',
              },
            ],
          },
          {
            id: 'group-share',
            title: '',
            displayInline: true,
            subactions: [
              {
                id: 'share-song',
                title: '分享歌曲',
                image: 'square.and.arrow.up',
                imageColor: '#ffffff',
              },
              {
                id: 'share-lyrics',
                title: '分享歌词',
                image: 'quote.bubble',
                imageColor: '#ffffff',
              },
            ],
          },
          {
            id: 'group-details',
            title: '',
            displayInline: true,
            subactions: [
              {
                id: 'song-info',
                title: '歌曲信息',
                image: 'info.circle',
                imageColor: '#ffffff',
              },
              {
                id: 'goto-album',
                title: '前往专辑',
                image: 'music.note.list',
                imageColor: '#ffffff',
              },
              {
                id: 'goto-artist',
                title: '查看艺术家',
                image: 'person.crop.circle',
                imageColor: '#ffffff',
              },
            ],
          },
        ]
      }

      // 向上弹出（默认，用于播放页底部的 DeckMoreButton）：
      // UIKit 从锚点（底部）由近及远向上排列，第 0 项在最靠近底部的指尖位置
      return [
        {
          id: 'group-details',
          title: '',
          displayInline: true,
          subactions: [
            {
              id: 'goto-artist',
              title: '查看艺术家',
              image: 'person.crop.circle',
              imageColor: '#ffffff',
            },
            {
              id: 'goto-album',
              title: '前往专辑',
              image: 'music.note.list',
              imageColor: '#ffffff',
            },
            {
              id: 'song-info',
              title: '歌曲信息',
              image: 'info.circle',
              imageColor: '#ffffff',
            },
          ],
        },
        {
          id: 'group-share',
          title: '',
          displayInline: true,
          subactions: [
            {
              id: 'share-lyrics',
              title: '分享歌词',
              image: 'quote.bubble',
              imageColor: '#ffffff',
            },
            {
              id: 'share-song',
              title: '分享歌曲',
              image: 'square.and.arrow.up',
              imageColor: '#ffffff',
            },
          ],
        },
        {
          id: 'group-playlist',
          title: '',
          displayInline: true,
          subactions: [
            {
              id: 'add-to-playlist',
              title: '添加到歌单',
              image: 'plus.circle',
              imageColor: '#ffffff',
            },
          ],
        },
      ]
    }

    return [
      {
        id: 'add-to-playlist',
        title: '添加到歌单',
        image: 'ic_menu_add',
        imageColor: '#ffffff',
      },
      {
        id: 'share-song',
        title: '分享歌曲',
        image: 'ic_menu_share',
        imageColor: '#ffffff',
      },
      {
        id: 'share-lyrics',
        title: '分享歌词',
        image: 'ic_menu_info_details',
        imageColor: '#ffffff',
      },
      {
        id: 'song-info',
        title: '歌曲信息',
        image: 'ic_menu_help',
        imageColor: '#ffffff',
      },
      {
        id: 'goto-album',
        title: '前往专辑',
        image: 'ic_media_play',
        imageColor: '#ffffff',
      },
      {
        id: 'goto-artist',
        title: '查看艺术家',
        image: 'ic_menu_myplaces',
        imageColor: '#ffffff',
      },
    ]
  }, [popDirection])

  const handleAction = ({ nativeEvent }: NativeActionEvent) => {
    setIsMenuOpen(false)
    onMenuOpenChange?.(false)
    switch (nativeEvent.event) {
      case 'add-to-playlist':
        toast('已添加到歌单')
        break
      case 'share-song':
        void Share.share({
          title: current.title,
          message: `正在听 ${current.title} - ${current.artistText}`,
        })
        break
      case 'share-lyrics':
        void Share.share({
          title: `${current.title} 歌词`,
          message: `《${current.title}》- ${current.artistText}\n(分享自轻简音乐)`,
        })
        break
      case 'song-info': {
        const durationSec = Math.round(current.durationMs / 1000)
        const m = Math.floor(durationSec / 60)
        const s = durationSec % 60
        const durationStr = `${m}:${String(s).padStart(2, '0')}`
        const meta = [current.title, current.artistText, current.albumText].filter(Boolean).join(' · ')
        toast(`${meta} (${durationStr})`)
        break
      }
      case 'goto-album':
        if (current.albumId) {
          const target = href.album(current.albumId)
          dismissAndNavigate(() => {
            router.push(target)
          })
        } else {
          toast('暂无专辑信息')
        }
        break
      case 'goto-artist':
        if (current.artistId) {
          const target = href.artist(current.artistId)
          dismissAndNavigate(() => {
            router.push(target)
          })
        } else {
          toast('暂无艺术家信息')
        }
        break
    }
  }

  return (
    <MenuView
      title="歌曲选项"
      themeVariant="dark"
      shouldOpenOnLongPress={false}
      isAnchoredToRight={true}
      actions={actions}
      onOpenMenu={() => {
        setIsMenuOpen(true)
        onMenuOpenChange?.(true)
        onBeforeOpen?.()
      }}
      onCloseMenu={() => {
        setIsMenuOpen(false)
        onMenuOpenChange?.(false)
      }}
      onPressAction={handleAction}
    >
      <IconButton
        name="more"
        size={iconSize.lg}
        color={isMenuOpen ? colors.textPrimary : colors.iconMid}
        isActive={isMenuOpen}
        onPress={() => {
          onBeforeOpen?.()
        }}
        accessibilityLabel="更多快捷操作"
      />
    </MenuView>
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
