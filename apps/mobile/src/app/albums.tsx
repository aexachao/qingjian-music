import { useCallback, useMemo } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { nextPageNumber, type Album } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { useServerSession } from '@/lib/server-session'
import { colors, spacing, typography } from '@/theme/tokens'

const PAGE_SIZE = 40

export default function AlbumsScreen() {
  const router = useRouter()
  const { provider, connection, signOut } = useServerSession()
  const { width } = useWindowDimensions()

  const columns = width >= 700 ? 3 : 2
  const itemSize = (width - spacing.lg * 2 - spacing.md * (columns - 1)) / columns

  const query = useInfiniteQuery({
    queryKey: ['albums', connection?.id],
    enabled: Boolean(provider),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      provider!.albums({ page: pageParam, size: PAGE_SIZE, sort: { field: 'createdAt', order: 'desc' } }),
    getNextPageParam: (lastPage) => nextPageNumber(lastPage),
  })

  const albums = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const total = query.data?.pages[0]?.total ?? 0

  const renderItem = useCallback(
    ({ item }: { item: Album }) => (
      <Link href={{ pathname: '/album/[id]', params: { id: item.id } }} asChild>
        <Pressable style={{ width: itemSize }} accessibilityRole="button" accessibilityLabel={`专辑 ${item.name}`}>
          <CoverImage coverId={item.coverId} size={itemSize} />
          <Text numberOfLines={1} style={styles.albumName}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={styles.albumArtist}>
            {item.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
          </Text>
        </Pressable>
      </Link>
    ),
    [itemSize],
  )

  if (query.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  if (query.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{query.error instanceof Error ? query.error.message : '加载失败'}</Text>
        <Pressable onPress={() => void query.refetch()} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryLabel}>重试</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <FlatList
      data={albums}
      key={columns}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      columnWrapperStyle={{ gap: spacing.md }}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>专辑</Text>
            <Text style={styles.subtitle}>
              {connection?.displayName} · 共 {total} 张
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="退出登录"
            onPress={async () => {
              await signOut()
              router.replace('/login')
            }}
          >
            <Text style={styles.signOut}>退出</Text>
          </Pressable>
        </View>
      }
      onEndReachedThreshold={0.6}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
      }}
      ListFooterComponent={
        query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.accent} /> : null
      }
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      onRefresh={() => void query.refetch()}
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing.md },
  headerText: { gap: spacing.xs },
  title: { ...typography.largeTitle, color: colors.text },
  subtitle: { ...typography.footnote, color: colors.textSecondary },
  signOut: { ...typography.subhead, color: colors.accent },
  albumName: { ...typography.subhead, color: colors.text, marginTop: spacing.sm },
  albumArtist: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  errorText: { ...typography.subhead, color: colors.textSecondary, textAlign: 'center' },
  retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryLabel: { ...typography.headline, color: colors.accent },
  footer: { paddingVertical: spacing.lg },
})
