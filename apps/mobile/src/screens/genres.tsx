import { FlatList, Pressable, useWindowDimensions, View } from 'react-native'
import { Link } from 'expo-router'
import type { Genre } from '@qj/core-domain'
import { GenreCard } from '@/components/genre-card'
import { ListToolbarBar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles } from '@/theme/theme-provider'
import { spacing } from '@/theme/tokens'

export function GenresScreen() {
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const { width } = useWindowDimensions()
  const bottom = useBottomSpace()
  const href = useDetailHref()

  const columns = 2
  const gap = spacing.md
  const cardWidth = (width - spacing.lg * 2 - gap * (columns - 1)) / columns

  const { selection, setSelection, sortKey, sort } = useListSort('genres')
  const { query, items, total, loadMore } = usePagedQuery<Genre>({
    queryKey: ['genres', connection?.id, sortKey],
    enabled: Boolean(provider),
    fetchPage: (page) => provider!.genres({ page, size: 50, sort }),
  })

  if (query.isPending) return <LoadingState />
  if (query.isLoadingError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <View style={styles.root}>
      <ListToolbarBar kind="genres" total={total} selection={selection} onSelect={setSelection} />
      <FlatList
        data={items}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        columnWrapperStyle={{ gap }}
        ListEmptyComponent={<EmptyState text="曲库里还没有流派" />}
        renderItem={({ item }) => (
          <Link href={href.genre(item.id, item.name, item.coverId)} asChild>
            <Pressable
              style={{ width: cardWidth }}
              accessibilityRole="button"
              accessibilityLabel={`流派 ${item.name}`}
            >
              <GenreCard genre={item} coverId={item.coverId} width={cardWidth} />
            </Pressable>
          </Link>
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
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1 },
  list: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
}))
