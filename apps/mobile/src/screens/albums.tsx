import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { Link } from 'expo-router'
import type { Album } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { ListToolbarBar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

const PAGE_SIZE = 40

export function AlbumsScreen() {
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const { width } = useWindowDimensions()
  const bottom = useBottomSpace()
  const href = useDetailHref()

  const columns = width >= 700 ? 3 : 2
  const gap = spacing.md
  const itemWidth = (width - spacing.lg * 2 - gap * (columns - 1)) / columns

  const { selection, setSelection, sortKey, sort } = useListSort('albums')
  const { query, items, total, loadMore } = usePagedQuery<Album>({
    queryKey: ['albums', connection?.id, sortKey],
    enabled: Boolean(provider),
    fetchPage: (page) => provider!.albums({ page, size: PAGE_SIZE, sort }),
  })

  if (query.isPending) return <LoadingState />
  if (query.isLoadingError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <View style={styles.root}>
      <ListToolbarBar kind="albums" total={total} selection={selection} onSelect={setSelection} />
      <FlatList
        data={items}
        key={columns}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        columnWrapperStyle={{ gap }}
        ListEmptyComponent={<EmptyState text="曲库里还没有专辑" />}
        renderItem={({ item }) => (
          <Link href={href.album(item.id)} asChild>
            <Pressable style={{ width: itemWidth }} accessibilityRole="button" accessibilityLabel={`专辑 ${item.name}`}>
              <CoverImage coverId={item.coverId} size={itemWidth} />
              <Text numberOfLines={1} style={styles.name}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={styles.artist}>
                {item.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
              </Text>
            </Pressable>
          </Link>
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          <PaginationFooter
            loading={query.isFetchingNextPage}
            error={query.isFetchNextPageError ? query.error : undefined}
            onRetry={() => void query.fetchNextPage()}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
      />
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1 },
  // flexGrow: 1 是给**空状态**用的：列表为空时让内容区撑满视窗，
  // ListEmptyComponent（list-states 里的 EmptyState，flex: 1 + 居中）才能在视窗里上下居中。
  // 有内容时它不产生任何视觉影响。
  list: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  name: { ...typography.subhead, color: colors.textPrimary, marginTop: spacing.sm },
  artist: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
}))
