import { Pressable, Text, View } from 'react-native'
import type { Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { FormatBadge } from '@/components/format-badge'
import { Icon } from '@/components/icon'
import { LivePlayingBars } from '@/components/playing-bars'
import { TrackMoreButton } from '@/components/track-more-button'
import { useToast } from '@/components/toast'
import { isGlobalMenuInteracting } from '@/lib/menu-guard'
import { useServerSession } from '@/lib/server-session'
import { useToggleFavorite } from '@/lib/favorites'
import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

interface TrackRowProps {
  track: Track
  /** 专辑内用序号，其它列表用封面 */
  leading: 'index' | 'cover'
  index: number
  playing?: boolean
  /** 选择态里不需要（点行是切换选中），所以可选 */
  onPress?: () => void
  /**
   * 多选：传了它就进入「选择态」行 —— 最左多一颗圆形勾选框、
   * 点整行 = 切换选中（不再播放），右侧的收藏与「···」都收起来。
   */
  selection?: { selected: boolean; onToggle: () => void }
}


/**
 * 全局单曲列表行组件 (TrackRow):
 * - 右侧不显示时间，统一显示「···」快捷操作按钮；
 * - 物理隔离主触控区与快捷操作区，并在退出菜单时防误触；
 * - 正在播放时，音符动效位于歌曲标题左侧（11pt 小巧律动）；
 * - 歌曲名称下方仅展示歌手名称，并在歌手名称前显示音频格式 Tag（如 FLAC、MP3 等）。
 */
export function TrackRow({ track, leading, index, playing = false, onPress, selection }: TrackRowProps) {
  const styles = useStyles()
  const colors = useThemeColors()
  const { provider } = useServerSession()
  const toggleFavorite = useToggleFavorite()
  const toast = useToast()
  const canFavorite = provider?.capabilities.favorites && track.isFavorite !== undefined
  const artistText = track.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'

  const handleFavoritePress = () => {
    if (!canFavorite) return
    const next = !track.isFavorite
    void toggleFavorite(track.id, next)
      .then(() => toast(next ? '已添加到我喜欢' : '已取消收藏'))
      .catch((e) => toast(e instanceof Error ? e.message : '操作失败'))
  }

  const handlePress = () => {
    if (isGlobalMenuInteracting()) return
    // 选择态里点整行 = 切换选中，不再播放（否则想多选就会误触播放）
    if (selection) {
      selection.onToggle()
      return
    }
    onPress?.()
  }

  return (
    <View style={styles.row}>
      {selection ? (
        <Pressable
          onPress={selection.onToggle}
          hitSlop={8}
          style={styles.checkSlot}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selection.selected }}
          accessibilityLabel={`${selection.selected ? '取消选择' : '选择'} ${track.title}`}
        >
          <Icon
            name={selection.selected ? 'checkmarkCircle' : 'circle'}
            size={22}
            color={selection.selected ? colors.accent : colors.textTertiary}
          />
        </Pressable>
      ) : null}

      {/* 主触控区：点击播放曲目 */}
      <Pressable
        style={({ pressed }) => [styles.trackMain, pressed && styles.trackMainPressed]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={
          selection
            ? `${selection.selected ? '已选中' : '未选中'} ${track.title}，${artistText}`
            : `${playing ? '正在播放' : '播放'} ${track.title}，${artistText}`
        }
        accessibilityState={selection ? { selected: selection.selected } : { selected: playing }}
      >
        {leading === 'index' ? (
          <View style={styles.trackNoSlot}>
            <Text style={[styles.trackNo, playing && styles.trackNoPlaying]}>
              {track.trackNo ?? index + 1}
            </Text>
          </View>
        ) : (
          <CoverImage
            coverId={track.coverId ?? track.album?.coverId}
            size={48}
            borderRadius={radius.sm}
          />
        )}

        <View style={styles.metaCol}>
          {/* 标题行：正在播放时音符律动动画位于标题左侧 */}
          <View style={styles.titleRow}>
            {playing ? (
              <View style={styles.playingSlot}>
                <LivePlayingBars size={11} />
              </View>
            ) : null}
            <Text numberOfLines={1} style={[styles.title, playing && styles.playing]}>
              {track.title}
            </Text>
          </View>

          {/* 副标题行：格式 Tag + 歌手名称 */}
          <View style={styles.subtitleRow}>
            <FormatBadge track={track} />
            <Text numberOfLines={1} style={styles.subtitle}>
              {artistText}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* 右侧：收藏 + 快捷菜单（选择态里都收起来，避免与多选打架） */}
      {!selection && canFavorite ? (
        <Pressable
          hitSlop={8}
          onPress={handleFavoritePress}
          accessibilityRole="button"
          accessibilityLabel={track.isFavorite ? '取消收藏' : '加入收藏'}
          style={styles.favoriteBtn}
        >
          <Icon
            name={track.isFavorite ? 'heart' : 'heartOutline'}
            size={20}
            color={track.isFavorite ? styles.favoriteActive.color : styles.favoriteInactive.color}
          />
        </Pressable>
      ) : null}
      {!selection ? <TrackMoreButton track={track} /> : null}
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  checkSlot: { width: 32, alignItems: 'center', justifyContent: 'center' },
  trackMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
  },
  trackMainPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  trackNoSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackNo: {
    ...typography.footnote,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  trackNoPlaying: {
    color: colors.playing,
    fontFamily: fonts.semibold,
  },
  metaCol: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playingSlot: {
    marginRight: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  playing: {
    color: colors.playing,
  },
  favoriteBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteActive: {
    color: colors.accent,
  },
  favoriteInactive: {
    color: colors.textTertiary,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
}))
