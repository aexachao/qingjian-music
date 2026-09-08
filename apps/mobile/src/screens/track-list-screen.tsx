import type { ReactElement } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import type { QueryKey } from '@tanstack/react-query'
import type { Page, PlaySource, Track } from '@qj/core-domain'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, spacing } from '@/theme/tokens'

interface TrackListScreenProps {
  queryKey: QueryKey
  fetchPage: (page: number) => Promise<Page<Track>>
  /** 播放来源：正在播放页顶部展示，队列页据此跳回来源 */
  source: PlaySource
  emptyText: string
  header?: ReactElement
  /** 专辑内显示序号，其它列表显示封面 */
  leading?: 'index' | 'cover'
  enabled?: boolean
}

/** 曲目列表通用页：收藏、最近播放、流派、歌单、全部歌曲都复用它 */
export function TrackListScreen({
  queryKey,
  fetchPage,
  source,
  emptyText,
  header,
  leading = 'cover',
  enabled = true,
}: TrackListScreenProps) {
  const { provider, connection } = useServerSession()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()
  const { query, items, loadMore } = usePagedQuery<Track>({
    queryKey,
    enabled: Boolean(provider) && enabled,
    fetchPage,
  })

  if (query.isPending) return <LoadingState />
  if (query.isLoadingError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      ListHeaderComponent={header ?? null}
      ListEmptyComponent={<EmptyState text={emptyText} />}
      renderItem={({ item, index }) => (
        <TrackRow
          track={item}
          index={index}
          leading={leading}
          playing={current?.serverId === connection?.id && current?.trackId === item.id}
          onPress={() => {
            if (!provider || !connection) return
            void playTrackList({ provider, serverId: connection.id, tracks: items, startIndex: index, source })
          }}
        />
      )}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        <PaginationFooter
          loading={query.isFetchingNextPage}
          error={query.isFetchNextPageError ? query.error : undefined}
          onRetry={() => void query.fetchNextPage()}
        />
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  separator: { height: 1, marginLeft: 60, backgroundColor: colors.borderSubtle },
})
