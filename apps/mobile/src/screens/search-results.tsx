import { FlatList, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import type { Album, Artist } from '@qj/core-domain'
import { AlbumRow, ArtistRow } from '@/components/entity-row'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { useBottomSpace } from '@/lib/bottom-space'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { colors, spacing } from '@/theme/tokens'
import { TrackListScreen } from './track-list-screen'

const PAGE_SIZE = 50

/** 搜索结果全部页：歌曲复用通用曲目列表，专辑 / 艺术家用各自的行 */
export function SearchResultsScreen({ type }: { type: 'tracks' | 'albums' | 'artists' }) {
  const { q } = useLocalSearchParams<{ q?: string }>()
  const keyword = (q ?? '').trim()
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()

  const title = type === 'tracks' ? '歌曲' : type === 'albums' ? '专辑' : '艺术家'

  const albums = usePagedQuery<Album>({
    queryKey: ['search-all-albums', connection?.id, keyword],
    enabled: Boolean(provider) && keyword.length > 0 && type === 'albums',
    fetchPage: (page) => provider!.searchAlbums(keyword, { page, size: PAGE_SIZE }),
  })
  const artists = usePagedQuery<Artist>({
    queryKey: ['search-all-artists', connection?.id, keyword],
    enabled: Boolean(provider) && keyword.length > 0 && type === 'artists',
    fetchPage: (page) => provider!.searchArtists(keyword, { page, size: PAGE_SIZE }),
  })

  const header = <Stack.Screen options={{ title: keyword ? `${title} · ${keyword}` : title }} />

  if (type === 'tracks') {
    return (
      <>
        {header}
        <TrackListScreen
          queryKey={['search-all-tracks', connection?.id, keyword]}
          enabled={keyword.length > 0}
          fetchPage={(page) => provider!.searchTracks(keyword, { page, size: PAGE_SIZE })}
          source={{ kind: 'search', label: `搜索 · ${keyword}` }}
          emptyText="没有找到匹配的歌曲"
        />
      </>
    )
  }

  const list = type === 'albums' ? albums : artists
  if (list.query.isPending) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    )
  }
  if (list.query.isLoadingError) {
    return (
      <>
        {header}
        <ErrorState error={list.query.error} onRetry={() => void list.query.refetch()} />
      </>
    )
  }

  return (
    <>
      {header}
      {type === 'albums' ? (
        <FlatList
          data={albums.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
          ListEmptyComponent={<EmptyState text="没有找到匹配的专辑" />}
          renderItem={({ item }) => <AlbumRow album={item} />}
          onEndReached={albums.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <PaginationFooter
              loading={albums.query.isFetchingNextPage}
              error={albums.query.isFetchNextPageError ? albums.query.error : undefined}
              onRetry={() => void albums.query.fetchNextPage()}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <FlatList
          data={artists.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
          ListEmptyComponent={<EmptyState text="没有找到匹配的艺术家" />}
          renderItem={({ item }) => <ArtistRow artist={item} />}
          onEndReached={artists.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <PaginationFooter
              loading={artists.query.isFetchingNextPage}
              error={artists.query.isFetchNextPageError ? artists.query.error : undefined}
              onRetry={() => void artists.query.fetchNextPage()}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  separator: { height: 1, marginLeft: 68, backgroundColor: colors.borderSubtle },
})
