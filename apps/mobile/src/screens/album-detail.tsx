import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export function AlbumDetailScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()

  // 封面头部滚过去之后，把计数与排序吸附到导航栏下方
  const [headerHeight, setHeaderHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  const [pinned, setPinned] = useState(false)
  const pinAt = Math.max(0, headerHeight - barHeight)

  const albumQuery = useQuery({
    queryKey: ['album', connection?.id, id],
    enabled: Boolean(provider && id),
    queryFn: () => provider!.album(id),
  })

  const { selection, setSelection, sortKey, sort } = useListSort('albumTracks')
  // 多选：与 TrackListScreen 同一套 —— 点工具条那颗图标弹模态
  const [selecting, setSelecting] = useState(false)
  const { query, items, total, loadMore } = usePagedQuery({
    queryKey: ['album-tracks', connection?.id, id, sortKey],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.albumTracks(id, { page, size: 100, sort }),
  })

  const album = albumQuery.data

  async function play(startIndex: number, shuffle = false) {
    if (!provider || !connection) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks: items,
      startIndex,
      source: { kind: 'album', id, label: album?.name ? `专辑 · ${album.name}` : '专辑' },
    })
    if (shuffle) await toggleShuffle()
  }

  const artistText = album?.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'
  const isMenuOpen = useIsMenuOpen()

  if (albumQuery.isPending) return <LoadingState />
  if (albumQuery.isLoadingError) return <ErrorState error={albumQuery.error} onRetry={() => void albumQuery.refetch()} />
  if (!album) return <EmptyState text="专辑不存在" />

  const toolbar = (
    <ListToolbar
      kind="albumTracks"
      total={total}
      selection={selection}
      onSelect={setSelection}
      onStartSelection={() => setSelecting(true)}
    />
  )

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: album.name,
          headerLeft: () => <StackBackButton />,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y
          const next = pinAt > 0 && y >= pinAt
          setPinned((previous) => (previous === next ? previous : next))
        }}
        ListHeaderComponent={
          <View style={styles.headerRoot} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <View style={styles.coverBlock}>
              <CoverImage coverId={album.coverId} size={220} borderRadius={radius.lg} />
              <Text style={styles.name}>{album.name}</Text>
              <Text style={styles.meta}>
                {artistText}
                {album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}
              </Text>

              <View style={styles.actions}>
                <Pressable
                  style={[styles.button, styles.buttonPrimary]}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放专辑"
                >
                  <Icon name="play" size={iconSize.sm} color={colors.textOnAccent} filled />
                  <Text style={[styles.buttonLabel, styles.buttonLabelPrimary]}>播放</Text>
                </Pressable>
                <Pressable
                  style={styles.button}
                  onPress={() => void play(0, true)}
                  accessibilityRole="button"
                  accessibilityLabel="随机播放专辑"
                >
                  <Icon name="shuffle" size={iconSize.sm} color={colors.textPrimary} />
                  <Text style={styles.buttonLabel}>随机播放</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.toolbarSlot} onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}>
              {toolbar}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            leading="index"
            playing={current?.serverId === connection?.id && current?.trackId === item.id}
            onPress={() => void play(index)}
          />
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

      {pinned && total > 0 ? <View style={styles.pinnedBar}>{toolbar}</View> : null}

      <TrackSelectionModal
        visible={selecting}
        items={items}
        source={{ kind: 'album', id, label: album?.name ? `专辑 · ${album.name}` : '专辑' }}
        leading="index"
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
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  // 计数与排序距离上方按钮留足间距，距离下方列表收窄
  headerRoot: { marginBottom: spacing.sm },
  coverBlock: { alignItems: 'center', gap: spacing.xs },
  toolbarSlot: { alignSelf: 'stretch', marginTop: spacing.lg },
  pinnedBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgPrimary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  name: { ...typography.title, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.md },
  meta: { ...typography.footnote, color: colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonLabel: { ...typography.headline, color: colors.textPrimary },
  buttonLabelPrimary: { color: colors.textOnAccent },
}))
