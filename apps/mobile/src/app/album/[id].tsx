import { useMemo } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { nextPageNumber, type Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { useServerSession } from '@/lib/server-session'
import { colors, spacing, typography } from '@/theme/tokens'

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()

  const albumQuery = useQuery({
    queryKey: ['album', connection?.id, id],
    enabled: Boolean(provider && id),
    queryFn: () => provider!.album(id),
  })

  const tracksQuery = useInfiniteQuery({
    queryKey: ['album-tracks', connection?.id, id],
    enabled: Boolean(provider && id),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => provider!.albumTracks(id, { page: pageParam, size: 100 }),
    getNextPageParam: (lastPage) => nextPageNumber(lastPage),
  })

  const tracks = useMemo(() => tracksQuery.data?.pages.flatMap((page) => page.items) ?? [], [tracksQuery.data])
  const album = albumQuery.data

  if (albumQuery.isPending || tracksQuery.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  return (
    <FlatList
      data={tracks}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <CoverImage coverId={album?.coverId} size={200} />
          <Text style={styles.albumName}>{album?.name ?? '专辑'}</Text>
          <Text style={styles.albumMeta}>
            {album?.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
            {album?.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}
            {tracks.length ? ` · ${tracks.length} 首` : ''}
          </Text>
        </View>
      }
      renderItem={({ item, index }: { item: Track; index: number }) => (
        <View style={styles.row} accessibilityLabel={`第 ${index + 1} 首 ${item.title}`}>
          <Text style={styles.trackNo}>{item.trackNo ?? index + 1}</Text>
          <View style={styles.trackText}>
            <Text numberOfLines={1} style={styles.trackTitle}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={styles.trackArtist}>
              {item.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
            </Text>
          </View>
          <Text style={styles.duration}>{formatDuration(item.durationMs)}</Text>
        </View>
      )}
      onEndReached={() => {
        if (tracksQuery.hasNextPage && !tracksQuery.isFetchingNextPage) void tracksQuery.fetchNextPage()
      }}
      ListFooterComponent={
        tracksQuery.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.accent} /> : null
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  albumName: { ...typography.title, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  albumMeta: { ...typography.footnote, color: colors.textSecondary, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  trackNo: { ...typography.footnote, color: colors.textTertiary, width: 24, textAlign: 'center' },
  trackText: { flex: 1, gap: 2 },
  trackTitle: { ...typography.callout, color: colors.text },
  trackArtist: { ...typography.caption, color: colors.textSecondary },
  duration: { ...typography.caption, color: colors.textTertiary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: spacing.lg },
})
