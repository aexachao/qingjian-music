import { useMemo } from 'react'
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native'
import type { Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { FormatBadge } from '@/components/format-badge'
import { LivePlayingBars } from '@/components/playing-bars'
import { TrackMoreButton } from '@/components/track-more-button'
import { isGlobalMenuInteracting } from '@/lib/menu-guard'
import { createThemedStyles } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { SectionHeader } from './SectionHeader'

const TRACKS_PER_PAGE = 3
const PEEK_WIDTH = 28
const PAGE_GAP = 14

interface PagedTrackCarouselProps {
  title: string
  tracks: Track[]
  seeAllHref?: string
  currentTrackId?: string
  currentServerId?: string
  serverId?: string
  onPlayTrack: (track: Track, index: number) => void
  onMenuOpenChange?: (open: boolean) => void
}

/**
 * 3首/屏 × 3屏 横滑单曲轮播组件 (Paged Track Carousel):
 * - 标题右侧向右箭头跟在 label 后面（间距严格 8pt）；
 * - 歌曲行物理隔离：左侧为独立播放触发器，右侧为独立的「···」快捷菜单，绝不发生误触误播；
 * - 正在播放时，音符律动条位于歌曲标题左侧，尺寸 11pt（严格矮于 15pt 歌名词条）；
 * - 歌曲名称下方仅展示歌手名称，并在歌手名称前显示音频格式 Tag（如 FLAC、MP3 等）。
 */
export function PagedTrackCarousel({
  title,
  tracks,
  seeAllHref,
  currentTrackId,
  currentServerId,
  serverId,
  onPlayTrack,
  onMenuOpenChange,
}: PagedTrackCarouselProps) {
  const styles = useStyles()
  const { width: screenWidth } = useWindowDimensions()
  const pageWidth = screenWidth - spacing.pageMargin * 2 - PEEK_WIDTH

  // 将平铺的单曲数组切分为每屏 3 首的分组矩阵（最多 3 屏）
  const pages = useMemo(() => {
    const chunked: { pageIndex: number; items: { track: Track; globalIndex: number }[] }[] = []
    const total = Math.min(tracks.length, 9)

    for (let i = 0; i < total; i += TRACKS_PER_PAGE) {
      const slice = tracks.slice(i, i + TRACKS_PER_PAGE).map((track, offset) => ({
        track,
        globalIndex: i + offset,
      }))
      chunked.push({ pageIndex: Math.floor(i / TRACKS_PER_PAGE), items: slice })
    }

    return chunked
  }, [tracks])

  if (tracks.length === 0) return null

  return (
    <View style={styles.container}>
      <SectionHeader title={title} href={seeAllHref} />

      <FlatList
        horizontal
        data={pages}
        keyExtractor={(page) => `page-${page.pageIndex}`}
        showsHorizontalScrollIndicator={false}
        snapToInterval={pageWidth + PAGE_GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        renderItem={({ item: page }) => (
          <View style={[styles.pageColumn, { width: pageWidth }]}>
            {page.items.map(({ track, globalIndex }) => {
              const isPlaying = currentServerId === serverId && currentTrackId === track.id
              const artistText = track.artists.map((a) => a.name).join(' / ') || '未知艺术家'

              return (
                <View key={track.id} style={styles.trackRow}>
                  {/* 左侧主触控区：点击播放歌曲，不包含右侧更多操作 */}
                  <Pressable
                    style={({ pressed }) => [styles.trackMain, pressed && styles.trackMainPressed]}
                    onPress={() => {
                      if (isGlobalMenuInteracting()) return
                      onPlayTrack(track, globalIndex)
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`播放 ${track.title}，${artistText}`}
                    accessibilityState={{ selected: isPlaying }}
                  >
                    <CoverImage
                      coverId={track.coverId ?? track.album?.coverId}
                      size={48}
                      borderRadius={radius.sm}
                    />

                    <View style={styles.metaCol}>
                      {/* 标题行：若正在播放，音符律动动画位于标题左侧 */}
                      <View style={styles.titleRow}>
                        {isPlaying ? (
                          <View style={styles.playingSlot}>
                            <LivePlayingBars size={11} />
                          </View>
                        ) : null}
                        <Text
                          numberOfLines={1}
                          style={[styles.trackTitle, isPlaying && styles.titlePlaying]}
                        >
                          {track.title}
                        </Text>
                      </View>

                      {/* 副标题行：格式 Tag + 歌手名称 */}
                      <View style={styles.subtitleRow}>
                        <FormatBadge track={track} />
                        <Text numberOfLines={1} style={styles.artistName}>
                          {artistText}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {/* 右侧：独立的「···」快捷菜单按键，物理隔离事件 */}
                  <TrackMoreButton track={track} onMenuOpenChange={onMenuOpenChange} />
                </View>
              )
            })}
          </View>
        )}
      />
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: {
    gap: spacing.titleGap,
  },
  listContent: {
    gap: PAGE_GAP,
    paddingRight: spacing.pageMargin,
  },
  pageColumn: {
    gap: 8,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
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
  trackTitle: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  titlePlaying: {
    color: colors.playing,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  artistName: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
}))
