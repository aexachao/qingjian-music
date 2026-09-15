import { useState, type ReactElement } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import type { QueryKey } from '@tanstack/react-query'
import type { Page, PlaySource, SortSpec, Track } from '@qj/core-domain'
import { ListToolbarBar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { TrackRow } from '@/components/track-row'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { useBottomSpace } from '@/lib/bottom-space'
import type { ListKind } from '@/lib/list-sort-policy'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { createThemedStyles } from '@/theme/theme-provider'
import { spacing } from '@/theme/tokens'

interface TrackListScreenProps {
  queryKey: QueryKey
  /** 排序由本组件内部管理：`sort` 为 undefined 表示该列表不排序（服务端不支持） */
  fetchPage: (page: number, sort: SortSpec | undefined) => Promise<Page<Track>>
  /** 决定工具条的计数单位与排序选项（见 list-sort-policy.ts） */
  listKind: ListKind
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
  listKind,
  source,
  emptyText,
  header,
  leading = 'cover',
  enabled = true,
}: TrackListScreenProps) {
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()
  const { selection, setSelection, sortKey, sort } = useListSort(listKind)
  // 多选：列表页本身不进选择态，点工具条那颗图标弹模态（选择与批量动作都在弹窗里）
  const [selecting, setSelecting] = useState(false)
  const { query, items, total, loadMore } = usePagedQuery<Track>({
    // sortKey 必须在 queryKey 里，否则换排序不会重新取数（只会换个本地顺序，而我们又不本地排序）
    queryKey: [...queryKey, sortKey],
    enabled: Boolean(provider) && enabled,
    fetchPage: (page) => fetchPage(page, sort),
  })

  const isMenuOpen = useIsMenuOpen()

  if (query.isPending) return <LoadingState />
  if (query.isLoadingError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <View style={styles.root}>
      {/* 计数与排序固定在导航栏下方，不随列表滚走 */}
      <ListToolbarBar
        kind={listKind}
        total={total}
        selection={selection}
        onSelect={setSelection}
        onStartSelection={() => setSelecting(true)}
      />

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

      <TrackSelectionModal
        visible={selecting}
        items={items}
        source={source}
        leading={leading}
        isPlaying={(trackId) => current?.serverId === connection?.id && current?.trackId === trackId}
        onEndReached={loadMore}
        footer={
          <PaginationFooter
            loading={query.isFetchingNextPage}
            error={query.isFetchNextPageError ? query.error : undefined}
            onRetry={() => void query.fetchNextPage()}
          />
        }
        onClose={() => setSelecting(false)}
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
  root: { flex: 1 },
  // flexGrow: 1 是给**空状态**用的：列表为空时让内容区撑满视窗，
  // ListEmptyComponent（list-states 里的 EmptyState，flex: 1 + 居中）才能在视窗里上下居中。
  // 有内容时它不产生任何视觉影响。
  list: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  separator: { height: 1, marginLeft: 60, backgroundColor: colors.borderSubtle },
}))
