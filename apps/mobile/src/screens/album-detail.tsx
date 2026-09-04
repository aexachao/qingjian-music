import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CoverImage } from '@/components/cover-image'
import { EmptyState, ErrorState, FooterLoader, LoadingState } from '@/components/list-states'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

export function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()
  const playingQid = usePlayerStore(selectCurrent)?.qid
  const bottom = useBottomSpace()

  const albumQuery = useQuery({
    queryKey: ['album', connection?.id, id],
    enabled: Boolean(provider && id),
    queryFn: () => provider!.album(id),
  })

  const { query, items, loadMore } = usePagedQuery({
    queryKey: ['album-tracks', connection?.id, id],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.albumTracks(id, { page, size: 100 }),
  })

  const album = albumQuery.data

  async function play(startIndex: number, shuffle = false) {
    if (!provider || !connection) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks: items,
      startIndex,
      source: { kind: 'album', id, label: album?.name ? `专辑 · ${album.name}` : '专辑' },
    })
    if (shuffle) await toggleShuffle()
  }

  if (albumQuery.isPending || query.isPending) return <LoadingState />
  if (albumQuery.isError) return <ErrorState error={albumQuery.error} onRetry={() => void albumQuery.refetch()} />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <>
      <Stack.Screen options={{ title: album?.name ?? '专辑' }} />
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      ListEmptyComponent={<EmptyState text="这张专辑还没有曲目" />}
      ListHeaderComponent={
        <View style={styles.header}>
          <CoverImage coverId={album?.coverId} size={200} />
          <Text style={styles.name}>{album?.name ?? '专辑'}</Text>
          <Text style={styles.meta}>
            {album?.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
            {album?.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}
            {items.length ? ` · ${items.length} 首` : ''}
          </Text>
          <View style={styles.actions}>
            <Pressable style={styles.button} onPress={() => void play(0)} accessibilityRole="button" accessibilityLabel="播放专辑">
              <Text style={styles.buttonLabel}>▶ 播放</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() => void play(0, true)}
              accessibilityRole="button"
              accessibilityLabel="随机播放专辑"
            >
              <Text style={styles.buttonLabel}>🔀 随机播放</Text>
            </Pressable>
          </View>
        </View>
      }
      renderItem={({ item, index }) => (
        <TrackRow
          track={item}
          index={index}
          leading="index"
          playing={playingQid === `${connection?.id}:${item.id}`}
          onPress={() => void play(index)}
        />
      )}
      onEndReached={loadMore}
      ListFooterComponent={<FooterLoader loading={query.isFetchingNextPage} />}
    />
    </>
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  header: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  name: { ...typography.title, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  meta: { ...typography.footnote, color: colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  buttonLabel: { ...typography.headline, color: colors.accent },
})
