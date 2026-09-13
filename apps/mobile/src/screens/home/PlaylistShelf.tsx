import { FlatList, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { Playlist } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { useDetailHref } from '@/lib/detail-href'
import { createThemedStyles } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { SectionHeader } from './SectionHeader'

const PLAYLIST_SIZE = 140

interface PlaylistShelfProps {
  playlists: Playlist[]
  isInteracting?: () => boolean
}

/**
 * 歌单陈列架 (Playlist Shelf):
 * - 如果用户拥有歌单则展示，无歌单则自动隐藏；
 * - 采用 140pt 标准大封套与 8pt 圆角；
 * - 展示歌单名称与包含歌曲数量；使用原生 Pressable 保留全部样式。
 */
export function PlaylistShelf({ playlists, isInteracting }: PlaylistShelfProps) {
  const styles = useStyles()
  const router = useRouter()
  const href = useDetailHref()

  if (playlists.length === 0) return null

  return (
    <View style={styles.container}>
      <SectionHeader title="歌单" href="/library/playlists" />

      <FlatList
        horizontal
        data={playlists}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const trackCountText = `${item.trackCount ?? 0} 首歌`

          return (
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() => {
                if (isInteracting?.()) return
                router.push(href.playlist(item.id))
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}，${trackCountText}`}
            >
              <View style={styles.coverWrapper}>
                <CoverImage coverId={item.coverId} size={PLAYLIST_SIZE} borderRadius={radius.album} />
              </View>

              <Text numberOfLines={1} style={styles.playlistName}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={styles.trackCount}>
                {trackCountText}
              </Text>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: {
    gap: spacing.titleGap,
  },
  list: {
    gap: spacing.shelfGap,
    paddingRight: spacing.pageMargin,
  },
  tile: {
    width: PLAYLIST_SIZE,
    gap: 4,
  },
  tilePressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  coverWrapper: {
    width: PLAYLIST_SIZE,
    height: PLAYLIST_SIZE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  playlistName: {
    ...typography.subhead,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    marginTop: 4,
  },
  trackCount: {
    ...typography.caption,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
}))
