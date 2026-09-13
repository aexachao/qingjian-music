import { FlatList, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { Album } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { useDetailHref } from '@/lib/detail-href'
import { createThemedStyles } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { SectionHeader } from './SectionHeader'

const ALBUM_SIZE = 140

interface AlbumShelfProps {
  title: string
  albums: Album[]
  seeAllHref?: string
  isInteracting?: () => boolean
}

/**
 * 纯粹的唱片陈列架 (Album Shelf):
 * 严格遵循 Apple Music 规范：140pt 方形纯净黑胶封套，8pt 平滑圆角；
 * 封面不贴任何杂乱遮挡按键，标题右侧配备向右箭头；使用原生 Pressable 保留全部样式。
 */
export function AlbumShelf({ title, albums, seeAllHref, isInteracting }: AlbumShelfProps) {
  const styles = useStyles()
  const router = useRouter()
  const href = useDetailHref()

  if (albums.length === 0) return null

  return (
    <View style={styles.container}>
      <SectionHeader title={title} href={seeAllHref} />

      <FlatList
        horizontal
        data={albums}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const artistText = item.artists.map((a) => a.name).join(' / ') || '未知艺术家'

          return (
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() => {
                if (isInteracting?.()) return
                router.push(href.album(item.id))
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}，${artistText}`}
            >
              <View style={styles.coverWrapper}>
                <CoverImage coverId={item.coverId} size={ALBUM_SIZE} borderRadius={radius.album} />
              </View>

              <Text numberOfLines={1} style={styles.albumName}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={styles.artistName}>
                {artistText}
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
    width: ALBUM_SIZE,
    gap: 4,
  },
  tilePressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  coverWrapper: {
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  albumName: {
    ...typography.subhead,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    marginTop: 4,
  },
  artistName: {
    ...typography.caption,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
}))
