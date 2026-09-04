import { useMemo } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { nextPageNumber, type Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()
  const playingQid = usePlayerStore(selectCurrent)?.qid
  const hasQueue = usePlayerStore((state) => state.queue.length > 0)

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

  async function play(startIndex: number, shuffle = false) {
    if (!provider || !connection) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks,
      startIndex,
      sourceLabel: album?.name ? `专辑 · ${album.name}` : '专辑',
    })
    if (shuffle) await toggleShuffle()
  }

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
      contentContainerStyle={[styles.list, hasQueue && styles.listWithMini]}
      ListHeaderComponent={
        <View style={styles.header}>
          <CoverImage coverId={album?.coverId} size={200} />
          <Text style={styles.albumName}>{album?.name ?? '专辑'}</Text>
          <Text style={styles.albumMeta}>
            {album?.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
            {album?.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}
            {tracks.length ? ` · ${tracks.length} 首` : ''}
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.actionButton}
              onPress={() => void play(0)}
              accessibilityRole="button"
              accessibilityLabel="播放整张专辑"
            >
              <Text style={styles.actionLabel}>▶ 播放</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => void play(0, true)}
              accessibilityRole="button"
              accessibilityLabel="随机播放整张专辑"
            >
              <Text style={styles.actionLabel}>🔀 随机播放</Text>
            </Pressable>
          </View>
        </View>
      }
      renderItem={({ item, index }: { item: Track; index: number }) => {
        const isPlaying = playingQid === `${connection?.id}:${item.id}`
        return (
          <Pressable
            style={styles.row}
            onPress={() => void play(index)}
            accessibilityRole="button"
            accessibilityLabel={`播放第 ${index + 1} 首 ${item.title}`}
          >
            <Text style={[styles.trackNo, isPlaying && styles.playingText]}>
              {isPlaying ? '♪' : (item.trackNo ?? index + 1)}
            </Text>
            <View style={styles.trackText}>
              <Text numberOfLines={1} style={[styles.trackTitle, isPlaying && styles.playingText]}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.trackArtist}>
                {item.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
              </Text>
            </View>
            <Text style={styles.duration}>{formatDuration(item.durationMs)}</Text>
          </Pressable>
        )
      }}
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
  listWithMini: { paddingBottom: 96 },
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  albumName: { ...typography.title, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  albumMeta: { ...typography.footnote, color: colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  actionButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  actionLabel: { ...typography.headline, color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  trackNo: { ...typography.footnote, color: colors.textTertiary, width: 24, textAlign: 'center' },
  trackText: { flex: 1, gap: 2 },
  trackTitle: { ...typography.callout, color: colors.text },
  trackArtist: { ...typography.caption, color: colors.textSecondary },
  playingText: { color: colors.accent },
  duration: { ...typography.caption, color: colors.textTertiary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: spacing.lg },
})
