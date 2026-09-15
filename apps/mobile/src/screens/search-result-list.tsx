import { FlatList, View } from 'react-native'
import type { Album, Artist, Playlist } from '@qj/core-domain'
import { AlbumRow, ArtistRow, PlaylistRow } from '@/components/entity-row'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { useBottomSpace } from '@/lib/bottom-space'
import { usePagedQuery } from '@/lib/paged-query'
import { searchTabLabel, searchTabs, type SearchTabKey } from '@/lib/search-tabs'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles } from '@/theme/theme-provider'
import { spacing } from '@/theme/tokens'
import { TrackListScreen } from './track-list-screen'

/**
 * 搜索结果的一个页签内容（歌曲 / 专辑 / 艺术家 / 歌单）。
 *
 * 以前这里是 `/search/{tracks,albums,artists,playlists}` 四个二级页（「查看全部」）；
 * 现在页签就在结果页上，所以退化成「按 type 渲染列表」的组件（2026-09-15 第 9 轮）。
 * 歌曲复用通用曲目列表，其余三类用各自的行。
 */
export function SearchResultList({ type, keyword }: { type: SearchTabKey; keyword: string }) {
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()

  const tabs = searchTabs({ canSearchPlaylists: Boolean(provider?.searchPlaylists) })
  const title = searchTabLabel(tabs, type)
  const enabled = Boolean(provider) && keyword.length > 0

  const albums = usePagedQuery<Album>({
    queryKey: ['search-all-albums', connection?.id, keyword],
    enabled: enabled && type === 'albums',
    fetchPage: (page) => provider!.searchAlbums(keyword, { page, size: PAGE_SIZE }),
  })
  const artists = usePagedQuery<Artist>({
    queryKey: ['search-all-artists', connection?.id, keyword],
    enabled: enabled && type === 'artists',
    fetchPage: (page) => provider!.searchArtists(keyword, { page, size: PAGE_SIZE }),
  })
  const playlists = usePagedQuery<Playlist>({
    queryKey: ['search-all-playlists', connection?.id, keyword],
    // 后端没有 searchPlaylists 时不发请求（该页签本来也不会出现）
    enabled: enabled && Boolean(provider?.searchPlaylists) && type === 'playlists',
    fetchPage: (page) => provider!.searchPlaylists!(keyword, { page, size: PAGE_SIZE }),
  })

  if (type === 'tracks') {
    return (
      <TrackListScreen
        queryKey={['search-all-tracks', connection?.id, keyword]}
        listKind="searchTracks"
        enabled={keyword.length > 0}
        fetchPage={(page, sort) => provider!.searchTracks(keyword, { page, size: PAGE_SIZE, sort })}
        source={{ kind: 'search', label: `搜索 · ${keyword}` }}
        emptyText="没有找到匹配的歌曲"
      />
    )
  }

  const list = type === 'albums' ? albums : type === 'artists' ? artists : playlists
  if (list.query.isPending) return <LoadingState />
  if (list.query.isLoadingError) {
    return <ErrorState error={list.query.error} onRetry={() => void list.query.refetch()} />
  }

  const footer = (
    <PaginationFooter
      loading={list.query.isFetchingNextPage}
      error={list.query.isFetchNextPageError ? list.query.error : undefined}
      onRetry={() => void list.query.fetchNextPage()}
    />
  )
  const empty = <EmptyState text={`没有找到匹配的${title}`} />
  const common = {
    keyExtractor: (item: { id: string }) => item.id,
    contentContainerStyle: [styles.list, { paddingBottom: bottom }],
    ListEmptyComponent: empty,
    onEndReached: list.loadMore,
    onEndReachedThreshold: 0.4,
    ListFooterComponent: footer,
    ItemSeparatorComponent: () => <View style={styles.separator} />,
    keyboardDismissMode: 'on-drag' as const,
    keyboardShouldPersistTaps: 'handled' as const,
  }

  if (type === 'albums') {
    return <FlatList data={albums.items} renderItem={({ item }) => <AlbumRow album={item} />} {...common} />
  }
  if (type === 'artists') {
    return <FlatList data={artists.items} renderItem={({ item }) => <ArtistRow artist={item} />} {...common} />
  }
  return (
    <FlatList data={playlists.items} renderItem={({ item }) => <PlaylistRow playlist={item} />} {...common} />
  )
}

const PAGE_SIZE = 50

const useStyles = createThemedStyles((colors) => ({
  // flexGrow: 1 是给**空状态**用的：列表为空时让内容区撑满视窗，
  // ListEmptyComponent（list-states 里的 EmptyState，flex: 1 + 居中）才能在视窗里上下居中。
  // 有内容时它不产生任何视觉影响。
  list: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  separator: { height: 1, marginLeft: 68, backgroundColor: colors.borderSubtle },
}))
