import { FlatList, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import type { Album, Artist, Playlist } from '@qj/core-domain'
import { AlbumRow, ArtistRow, PlaylistRow } from '@/components/entity-row'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { useBottomSpace } from '@/lib/bottom-space'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles } from '@/theme/theme-provider'
import { spacing } from '@/theme/tokens'
import { TrackListScreen } from './track-list-screen'

const PAGE_SIZE = 50

export type SearchResultType = 'tracks' | 'albums' | 'artists' | 'playlists'

const TITLES: Record<SearchResultType, string> = {
  tracks: '歌曲',
  albums: '专辑',
  artists: '艺术家',
  playlists: '歌单',
}

/** 搜索结果全部页：歌曲复用通用曲目列表，专辑 / 艺术家 / 歌单用各自的行 */
export function SearchResultsScreen({ type }: { type: SearchResultType }) {
  const styles = useStyles()
  const { q } = useLocalSearchParams<{ q?: string }>()
  const keyword = (q ?? '').trim()
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()

  const title = TITLES[type]

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
  const playlists = usePagedQuery<Playlist>({
    queryKey: ['search-all-playlists', connection?.id, keyword],
    // 后端没有 searchPlaylists 时（例如未来接入的其它后端）不发请求，直接显示空态
    enabled: Boolean(provider?.searchPlaylists) && keyword.length > 0 && type === 'playlists',
    fetchPage: (page) => provider!.searchPlaylists!(keyword, { page, size: PAGE_SIZE }),
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

  const list = type === 'albums' ? albums : type === 'artists' ? artists : playlists
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

  const emptyText = `没有找到匹配的${title}`
  const footer = (
    <PaginationFooter
      loading={list.query.isFetchingNextPage}
      error={list.query.isFetchNextPageError ? list.query.error : undefined}
      onRetry={() => void list.query.fetchNextPage()}
    />
  )

  return (
    <>
      {header}
      {type === 'albums' ? (
        <FlatList
          data={albums.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
          ListEmptyComponent={<EmptyState text={emptyText} />}
          renderItem={({ item }) => <AlbumRow album={item} />}
          onEndReached={albums.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={footer}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : type === 'artists' ? (
        <FlatList
          data={artists.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
          ListEmptyComponent={<EmptyState text={emptyText} />}
          renderItem={({ item }) => <ArtistRow artist={item} />}
          onEndReached={artists.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={footer}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <FlatList
          data={playlists.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
          ListEmptyComponent={<EmptyState text={emptyText} />}
          renderItem={({ item }) => <PlaylistRow playlist={item} />}
          onEndReached={playlists.loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={footer}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </>
  )
}

const useStyles = createThemedStyles((colors) => ({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  separator: { height: 1, marginLeft: 68, backgroundColor: colors.borderSubtle },
}))
