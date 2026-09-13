import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export function AlbumDetailScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()
  const current = usePlayerStore(selectCurrent)
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

  const artistText = album?.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'
  const isMenuOpen = useIsMenuOpen()

  if (albumQuery.isPending) return <LoadingState />
  if (albumQuery.isLoadingError) return <ErrorState error={albumQuery.error} onRetry={() => void albumQuery.refetch()} />
  if (!album) return <EmptyState text="专辑不存在" />

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: album.name,
          headerLeft: () => <StackBackButton />,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <CoverImage coverId={album.coverId} size={220} borderRadius={radius.lg} />
            <Text style={styles.name}>{album.name}</Text>
            <Text style={styles.meta}>
              {artistText}
              {album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}
              {items.length > 0 ? ` · ${items.length} 首歌曲` : ''}
            </Text>

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, styles.buttonPrimary]}
                onPress={() => void play(0)}
                accessibilityRole="button"
                accessibilityLabel="播放专辑"
              >
                <Icon name="play" size={iconSize.sm} color={colors.textOnAccent} filled />
                <Text style={[styles.buttonLabel, styles.buttonLabelPrimary]}>播放</Text>
              </Pressable>
              <Pressable
                style={styles.button}
                onPress={() => void play(0, true)}
                accessibilityRole="button"
                accessibilityLabel="随机播放专辑"
              >
                <Icon name="shuffle" size={iconSize.sm} color={colors.textPrimary} />
                <Text style={styles.buttonLabel}>随机播放</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            leading="index"
            playing={current?.serverId === connection?.id && current?.trackId === item.id}
            onPress={() => void play(index)}
          />
        )}
        onEndReached={loadMore}
        ListFooterComponent={
          <PaginationFooter
            loading={query.isFetchingNextPage}
            error={query.isFetchNextPageError ? query.error : undefined}
            onRetry={() => void query.fetchNextPage()}
          />
        }
      />

      {isMenuOpen ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {}}
        />
      ) : null}
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  header: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  name: { ...typography.title, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.md },
  meta: { ...typography.footnote, color: colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonLabel: { ...typography.headline, color: colors.textPrimary },
  buttonLabelPrimary: { color: colors.textOnAccent },
}))
