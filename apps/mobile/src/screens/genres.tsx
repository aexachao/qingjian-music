import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import type { Genre } from '@qj/core-domain'
import { EmptyState, ErrorState, FooterLoader, LoadingState } from '@/components/list-states'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { colors, spacing, typography } from '@/theme/tokens'

export function GenresScreen() {
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()
  const href = useDetailHref()

  const { query, items, loadMore } = usePagedQuery<Genre>({
    queryKey: ['genres', connection?.id],
    enabled: Boolean(provider),
    fetchPage: (page) => provider!.genres({ page, size: 50 }),
  })

  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      ListEmptyComponent={<EmptyState text="曲库里还没有流派" />}
      renderItem={({ item }) => (
        <Link href={href.genre(item.id, item.name)} asChild>
          <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`流派 ${item.name}`}>
            <Text style={styles.name}>{item.name}</Text>
            {item.trackCount ? <Text style={styles.meta}>{item.trackCount} 首</Text> : null}
          </Pressable>
        </Link>
      )}
      onEndReached={loadMore}
      ListFooterComponent={<FooterLoader loading={query.isFetchingNextPage} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  name: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textTertiary },
  separator: { height: 1, backgroundColor: colors.borderSubtle },
})
