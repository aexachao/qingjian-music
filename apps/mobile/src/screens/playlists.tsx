import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import type { Playlist } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { EmptyState, ErrorState, FooterLoader, LoadingState } from '@/components/list-states'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { colors, radius, spacing, typography } from '@/theme/tokens'

export function PlaylistsScreen() {
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()
  const href = useDetailHref()

  const { query, items, loadMore } = usePagedQuery<Playlist>({
    queryKey: ['playlists', connection?.id],
    enabled: Boolean(provider),
    fetchPage: (page) => provider!.playlists({ page, size: 50 }),
  })

  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      ListEmptyComponent={<EmptyState text="还没有歌单，可以在飞牛音乐网页端创建" />}
      renderItem={({ item }) => (
        <Link href={href.playlist(item.id, item.name)} asChild>
          <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`歌单 ${item.name}`}>
            <CoverImage coverId={item.coverId} size={52} borderRadius={radius.sm} />
            <View style={styles.text}>
              <Text numberOfLines={1} style={styles.name}>
                {item.name}
              </Text>
              <Text style={styles.meta}>{item.trackCount ? `${item.trackCount} 首` : '空歌单'}</Text>
            </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  text: { flex: 1, gap: 2 },
  name: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  separator: { height: 1, marginLeft: 68, backgroundColor: colors.borderSubtle },
})
