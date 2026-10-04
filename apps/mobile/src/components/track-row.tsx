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
  track?: Track
  /** Read-only catalog row that deliberately has no local playback identity. */
  display?: { title: string; subtitle: string }
  /** A trailing state label replaces the local-track menu. */
  statusLabel?: string
  disabled?: boolean
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
export function TrackRow({ track, display, statusLabel, disabled = false, leading, index, playing = false, onPress, selection }: TrackRowProps) {
  const styles = useStyles()
  const colors = useThemeColors()
  const artistText = display?.subtitle ?? (track?.artists.map((artist) => artist.name).join(' / ') || '未知艺术家')
  const title = display?.title ?? track?.title ?? ''
  const isDisabled = disabled || !track

  const handlePress = () => {
    if (isGlobalMenuInteracting()) return
    if (isDisabled) return
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
          accessibilityLabel={`${selection.selected ? '取消选择' : '选择'} ${title}`}
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
        disabled={isDisabled}
        accessibilityRole={isDisabled ? 'text' : 'button'}
        accessibilityLabel={
          selection
            ? `${selection.selected ? '已选中' : '未选中'} ${title}，${artistText}`
            : isDisabled
              ? `${title}，${artistText}，${statusLabel ?? '不可播放'}`
              : `${playing ? '正在播放' : '播放'} ${title}，${artistText}`
        }
        accessibilityState={selection ? { selected: selection.selected } : { selected: playing, disabled: isDisabled }}
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
          <CoverImage
            coverId={track?.coverId ?? track?.album?.coverId}
            size={48}
            borderRadius={radius.sm}
          />
        )}

        <View style={styles.metaCol}>
          {/* 封面行在歌名前显示律动；序号行只在序号位显示，避免重复。 */}
          <View style={styles.titleRow}>
            {playing && leading === 'cover' ? <LivePlayingBars size={11} /> : null}
            <Text numberOfLines={1} style={[styles.title, playing && styles.playing]}>
              {title}
            </Text>
          </View>

          {/* 副标题行：格式 Tag + 歌手名称 */}
          <View style={styles.subtitleRow}>
            {track ? <FormatBadge track={track} /> : null}
            <Text numberOfLines={1} style={styles.subtitle}>
              {artistText}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* 右侧只有「···」：收藏已挪进这个菜单（第 4 轮），行里不再摆第二个按钮 */}
      {statusLabel ? (
        <View style={styles.statusSlot}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      ) : track && !selection ? <TrackMoreButton track={track} /> : null}
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
  statusSlot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
}))
