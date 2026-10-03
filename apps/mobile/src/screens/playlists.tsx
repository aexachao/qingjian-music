import { useMemo } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { Link, Stack } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import type { Playlist } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { ListToolbarBar, useListSort } from '@/components/list-toolbar'
import { ErrorState, PaginationFooter } from '@/components/list-states'
import { TrackListSkeleton } from '@/components/skeleton'
import { usePrompt } from '@/components/prompt-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export function PlaylistsScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const prompt = usePrompt()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canWrite = provider?.capabilities.playlists === 'write'

  const { selection, setSelection, sortKey, sort } = useListSort('playlists')
  const { query, items, total, loadMore } = usePagedQuery<Playlist>({
    queryKey: ['playlists', connection?.id, sortKey],
    enabled: Boolean(provider),
    fetchPage: (page) => provider!.playlists({ page, size: 50, sort }),
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

  const screenOptions = useMemo(
    () => ({
      headerRight: canWrite
        ? () => (
            <Pressable
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              onPress={handleCreate}
              accessibilityRole="button"
              accessibilityLabel="新建歌单"
            >
              <Icon name="add" size={iconSize.lg} color={colors.textPrimary} />
            </Pressable>
          )
        : undefined,
    }),
    [canWrite, handleCreate, colors.textPrimary],
  )

  if (query.isPending) return <TrackListSkeleton />
  if (query.isLoadingError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  return (
    <View style={styles.root}>
      {/* 新建入口放导航栏右侧；不能写（只读后端）时整颗按钮不出现 */}
      <Stack.Screen options={screenOptions} />

      <ListToolbarBar kind="playlists" total={total} selection={selection} onSelect={setSelection} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {canWrite ? '还没有歌单' : '还没有歌单，可以在飞牛音乐网页端创建'}
            </Text>
            {canWrite ? (
              <Pressable
                style={styles.emptyButton}
                onPress={handleCreate}
                accessibilityRole="button"
                accessibilityLabel="新建歌单"
              >
                <Text style={styles.emptyButtonLabel}>新建歌单</Text>
              </Pressable>
            ) : null}
          </View>
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
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1 },
  // flexGrow: 1 是给**空状态**用的：列表为空时让内容区撑满视窗，
  // ListEmptyComponent（list-states 里的 EmptyState，flex: 1 + 居中）才能在视窗里上下居中。
  // 有内容时它不产生任何视觉影响。
  list: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  emptyText: { ...typography.subhead, color: colors.textSecondary, textAlign: 'center' },
  emptyButton: {
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.ctaPrimaryBg,
  },
  emptyButtonLabel: { ...typography.headline, color: colors.ctaPrimaryText },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  text: { flex: 1, gap: 2 },
  name: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  separator: { height: 1, marginLeft: 68, backgroundColor: colors.borderSubtle },
}))
