import { Pressable, Text, View } from 'react-native'
import type { Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { FormatBadge } from '@/components/format-badge'
import { Icon } from '@/components/icon'
import { LivePlayingBars } from '@/components/playing-bars'
import { TrackMoreButton } from '@/components/track-more-button'
import { isGlobalMenuInteracting } from '@/lib/menu-guard'
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
  const artistText = track.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'

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
            color={selection.selected ? colors.stateSelected : colors.textTertiary}
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
            {playing ? (
              <LivePlayingBars size={11} />
            ) : (
              <Text style={styles.trackNo}>
                {index + 1}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.coverWrapper}>
            <CoverImage
              coverId={track.coverId ?? track.album?.coverId}
              size={48}
              borderRadius={radius.sm}
            />
            {playing ? (
              <View style={styles.coverPlayingOverlay}>
                <LivePlayingBars size={11} />
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.metaCol}>
          {/* 标题行：歌名永远保持像素级左平齐，绝不被播放中动画推移偏离 */}
          <View style={styles.titleRow}>
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

      {/* 右侧只有「···」：收藏已挪进这个菜单（第 4 轮），行里不再摆第二个按钮 */}
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
    fontWeight: '600',
  },
  coverWrapper: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  coverPlayingOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgFloatingBlur,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
  title: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  playing: {
    color: colors.playing,
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
