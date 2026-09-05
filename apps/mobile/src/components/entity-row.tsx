import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import type { Album, Artist } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { useDetailHref } from '@/lib/detail-href'
import { colors, radius, spacing, typography } from '@/theme/tokens'

const THUMB = 52

/** 专辑行：搜索结果和搜索全部页共用 */
export function AlbumRow({ album }: { album: Album }) {
  const href = useDetailHref()
  return (
    <Link href={href.album(album.id)} asChild>
      <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`专辑 ${album.name}`}>
        <CoverImage coverId={album.coverId} size={THUMB} borderRadius={radius.sm} />
        <View style={styles.text}>
          <Text numberOfLines={1} style={styles.title}>
            {album.name}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {album.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
          </Text>
        </View>
      </Pressable>
    </Link>
  )
}

/** 艺术家行：头像用圆形，和专辑的方形封面区分开 */
export function ArtistRow({ artist }: { artist: Artist }) {
  const href = useDetailHref()
  return (
    <Link href={href.artist(artist.id)} asChild>
      <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`艺术家 ${artist.name}`}>
        <CoverImage coverId={artist.coverId} size={THUMB} borderRadius={THUMB / 2} />
        <View style={styles.text}>
          <Text numberOfLines={1} style={styles.title}>
            {artist.name}
          </Text>
          {artist.trackCount ? <Text style={styles.subtitle}>{artist.trackCount} 首</Text> : null}
        </View>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  text: { flex: 1, gap: 2 },
  title: { ...typography.callout, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
})
