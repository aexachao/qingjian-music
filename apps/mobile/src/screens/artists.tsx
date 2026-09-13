import { FlatList, Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import type { Artist } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

export function ArtistsScreen() {
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()
  const href = useDetailHref()

  const { query, items, total, loadMore } = usePagedQuery<Artist>({
    queryKey: ['artists', connection?.id],
    enabled: Boolean(provider),
    fetchPage: (page) => provider!.artists({ page, size: 50 }),
  })

  if (query.isPending) return <LoadingState />
  if (query.isLoadingError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      ListHeaderComponent={total > 0 ? <Text style={styles.total}>共 {total} 位</Text> : null}
      ListEmptyComponent={<EmptyState text="曲库里还没有艺术家" />}
      renderItem={({ item }) => (
        <Link href={href.artist(item.id)} asChild>
          <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`艺术家 ${item.name}`}>
            <CoverImage coverId={item.coverId} size={52} borderRadius={26} />
            <View style={styles.text}>
              <Text numberOfLines={1} style={styles.name}>
                {item.name}
              </Text>
              {item.trackCount ? <Text style={styles.meta}>{item.trackCount} 首</Text> : null}
            </View>
          </Pressable>
        </Link>
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

const useStyles = createThemedStyles((colors) => ({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  total: { ...typography.caption, color: colors.textTertiary, paddingBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  text: { flex: 1, gap: 2 },
  name: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  separator: { height: 1, marginLeft: 68, backgroundColor: colors.borderSubtle },
}))
