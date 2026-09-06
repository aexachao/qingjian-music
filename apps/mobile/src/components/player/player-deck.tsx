import { useCallback, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { QueueItem } from '@qj/core-domain'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { MarqueeText } from '@/components/marquee-text'
import { ProgressBar } from '@/components/progress-bar'
import { SystemVolumeSlider } from '../../../modules/system-volume'
import { useToast } from '@/components/toast'
import { useToggleFavorite } from '@/lib/favorites'
import { formatOffset, OFFSET_STEP_MS, useLyricOffset } from '@/lib/lyric-offset'
import { clearQueue, skipToNextSafe, skipToPreviousSmart, togglePlay } from '@/player/controller'
import { colors, radius, spacing, typography } from '@/theme/tokens'

interface PlayerDeckProps {
  current: QueueItem
}

/**
 * 播放页下半部分：歌名行（右侧「喜欢」「···」）+ 进度条 + 传输控制 + 音量条。
 * 封面页和歌词页共用它，两页只有上半部分不同。
 * 「···」的快捷菜单在这个按钮上方浮现（对齐 iOS 上下文菜单的位置）。
 */
export function PlayerDeck({ current }: PlayerDeckProps) {
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

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          {/* 长歌名装不下就来回滚动，别用省略号把名字截掉 */}
          <MarqueeText text={current.title} style={styles.title} />
          <MarqueeText
            text={`${current.artistText}${current.albumText ? ` — ${current.albumText}` : ''}`}
            style={styles.artist}
          />
        </View>
        <IconButton
          name="heart"
          size={iconSize.lg}
          color={current.isFavorite ? colors.like : colors.iconMid}
          filled={current.isFavorite}
          onPress={() => void onToggleFavorite()}
          accessibilityLabel={current.isFavorite ? '取消收藏' : '收藏'}
        />
        <DeckMoreButton current={current} />
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

      {/* 系统音量（MPVolumeView）：App 内没有公开 API 能改系统音量，只能用系统的滑杆 */}
      <View style={styles.volumeRow}>
        <Icon name="volumeDown" size={iconSize.sm} color={colors.iconDim} />
        <SystemVolumeSlider style={styles.volumeSlider} />
        <Icon name="volumeUp" size={iconSize.md} color={colors.iconDim} />
      </View>
    </View>
  )
}

/** 「···」按钮 + 在它上方浮现的快捷菜单 */
function DeckMoreButton({ current }: { current: QueueItem }) {
  const [open, setOpen] = useState(false)
  // 打开瞬间记下触摸位置（window 坐标），菜单就摆在按钮上方
  const [anchor, setAnchor] = useState<{ pageX: number; pageY: number } | null>(null)
  const toast = useToast()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const { offsetMs, adjust, canAdjust } = useLyricOffset(current.trackId)

  const openMenu = (pageX: number, pageY: number) => {
    setAnchor({ pageX, pageY })
    setOpen(true)
  }

  const run = (action: () => void) => {
    setOpen(false)
    action()
  }

  const adjustLyric = (deltaMs: number) => {
    adjust(deltaMs)
    toast(`歌词偏移 ${deltaMs > 0 ? '提前' : '延后'} 0.5 秒`)
  }

  const items: { key: string; label: string; destructive?: boolean; onPress: () => void }[] = []
  if (current.albumId) {
    items.push({
      key: 'album',
      label: '查看专辑',
      // 用 replace：跳走时把播放页收起来，回退键回到原来的页面（迷你条还在底部）
      onPress: () => router.replace({ pathname: '/library/album/[id]', params: { id: current.albumId! } }),
    })
  }
  if (current.artistId) {
    items.push({
      key: 'artist',
      label: '查看艺术家',
      onPress: () => router.replace({ pathname: '/library/artist/[id]', params: { id: current.artistId! } }),
    })
  }
  if (canAdjust) {
    items.push({ key: 'earlier', label: '歌词提前 0.5 秒', onPress: () => adjustLyric(OFFSET_STEP_MS) })
    items.push({ key: 'later', label: '歌词延后 0.5 秒', onPress: () => adjustLyric(-OFFSET_STEP_MS) })
    if (offsetMs !== 0) {
      items.push({
        key: 'reset',
        label: '歌词偏移归零',
        onPress: () => {
          adjust(-offsetMs)
          toast('歌词偏移已归零')
        },
      })
    }
  }
  items.push({
    key: 'clear',
    label: '清空队列',
    destructive: true,
    onPress: () => {
      void clearQueue()
      router.back()
    },
  })

  // 行高固定，先估算菜单高度再往按钮上方摆；贴到顶部时往下让一点
  const estHeight = items.length * 46 + 12 + (canAdjust ? 26 : 0)
  const top = Math.max((anchor?.pageY ?? 0) - 22 - 8 - estHeight, insets.top + 6)
  const right = windowWidth - (anchor?.pageX ?? 0) - 18

  return (
    <>
      <Pressable
        onPress={(event) => openMenu(event.nativeEvent.pageX, event.nativeEvent.pageY)}
        style={styles.moreHit}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="更多操作"
      >
        <Icon name="more" size={iconSize.lg} color={colors.iconMid} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* 点空白处关掉 */}
        <Pressable style={styles.menuScrim} onPress={() => setOpen(false)}>
          {anchor ? (
            <View style={[styles.menuCard, { top, right }]}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle} numberOfLines={1}>
                  {current.title}
                </Text>
                {canAdjust ? <Text style={styles.menuHint}>歌词偏移 {formatOffset(offsetMs)}</Text> : null}
              </View>
              {items.map((item, index) => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    styles.menuRow,
                    index > 0 && styles.menuRowBorder,
                    pressed && styles.menuRowPressed,
                  ]}
                  onPress={() => run(item.onPress)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.menuLabel, item.destructive && styles.menuLabelDestructive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
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
  moreHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  /** 大字形需要更大的命中区，56 的图标不能只给 44 */
  controlHit: { minWidth: 64, minHeight: 64 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // 系统滑杆占满剩余宽度；高度只给触摸区，轨道是系统自己画的细线
  volumeSlider: { flex: 1, height: 28 },
  menuScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  menuCard: {
    position: 'absolute',
    width: 250,
    borderRadius: radius.lg,
    backgroundColor: '#2a2a30ee',
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  menuHeader: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 2 },
  menuTitle: { ...typography.callout, color: colors.textPrimary },
  menuHint: { ...typography.footnote, color: colors.textTertiary },
  menuRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  menuRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  menuRowPressed: { backgroundColor: colors.bgButtonSecondary },
  menuLabel: { ...typography.callout, color: colors.textPrimary },
  menuLabelDestructive: { color: colors.like },
})
