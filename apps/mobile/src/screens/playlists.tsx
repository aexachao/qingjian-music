import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import type { Playlist } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { useConfirm } from '@/components/confirm-modal'
import { usePrompt } from '@/components/prompt-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export function PlaylistsScreen() {
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const prompt = usePrompt()
  const confirm = useConfirm()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canWrite = provider?.capabilities.playlists === 'write'

  const { query, items, loadMore } = usePagedQuery<Playlist>({
    queryKey: ['playlists', connection?.id],
    enabled: Boolean(provider),
    fetchPage: (page) => provider!.playlists({ page, size: 50 }),
  })

  const handleCreate = () => {
    prompt({
      title: '新建歌单',
      placeholder: '歌单名称',
      confirmText: '创建',
      cancelText: '取消',
      maxLength: 32,
      validate: (value) => {
        if (!value.trim()) return '歌单名称不能为空'
        if (value.trim().length > 32) return '名称不能超过 32 个字符'
        return undefined
      },
      onConfirm: async (name) => {
        try {
          await provider!.createPlaylist!({ name })
          toast('歌单创建成功')
          await queryClient.invalidateQueries({ queryKey: ['playlists', connection?.id] })
        } catch (e) {
          toast(e instanceof Error ? e.message : '创建失败')
        }
      },
    })
  }

  if (query.isPending) return <LoadingState />
  if (query.isLoadingError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      ListEmptyComponent={
        <EmptyState
          text={
            canWrite
              ? '还没有歌单，点击右上角 + 号创建一个'
              : '还没有歌单，可以在飞牛音乐网页端创建'
          }
        />
      }
      ListHeaderComponent={
        canWrite ? (
          <Pressable
            style={styles.createRow}
            onPress={handleCreate}
            accessibilityRole="button"
            accessibilityLabel="新建歌单"
          >
            <View style={styles.createIcon}>
              <Text style={styles.createIconText}>+</Text>
            </View>
            <Text style={styles.createText}>新建歌单</Text>
          </Pressable>
        ) : null
      }
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
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  createIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.bgListItem,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createIconText: {
    fontSize: 28,
    color: colors.accent,
    lineHeight: 32,
  },
  createText: {
    ...typography.callout,
    color: colors.accent,
    fontWeight: '600',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  text: { flex: 1, gap: 2 },
  name: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  separator: { height: 1, marginLeft: 68, backgroundColor: colors.borderSubtle },
}))
