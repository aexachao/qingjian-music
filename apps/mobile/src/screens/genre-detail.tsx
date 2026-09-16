import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Icon, iconSize } from '@/components/icon'
import { ListToolbar, useListSort } from '@/components/list-toolbar'
import { EmptyState, ErrorState, LoadingState, PaginationFooter } from '@/components/list-states'
import { StackBackButton } from '@/components/stack-back-button'
import { TrackSelectionModal } from '@/components/track-selection-modal'
import { TrackRow } from '@/components/track-row'
import { VinylDisc } from '@/components/vinyl-disc'
import { useBottomSpace } from '@/lib/bottom-space'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export function GenreDetailScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const { id, name, coverId: initialCoverId } = useLocalSearchParams<{ id: string; name?: string; coverId?: string }>()
  const { provider, connection } = useServerSession()
  const current = usePlayerStore(selectCurrent)
  const bottom = useBottomSpace()

  const [headerHeight, setHeaderHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  const [pinned, setPinned] = useState(false)
  const pinAt = Math.max(0, headerHeight - barHeight)

  const { selection, setSelection, sortKey, sort } = useListSort('genreTracks')
  const [selecting, setSelecting] = useState(false)
  const { query, items, total, loadMore } = usePagedQuery({
    queryKey: ['genre-tracks', connection?.id, id, sortKey],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.genreTracks(id, { page, size: 100, sort }),
  })

  async function play(startIndex: number, shuffle = false) {
    if (!provider || !connection) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks: items,
      startIndex,
      source: { kind: 'genre', id, label: name ? `流派 · ${name}` : '流派' },
    })
    if (shuffle) await toggleShuffle()
  }

  const isMenuOpen = useIsMenuOpen()

  // 获取封面：排序切换时保留已有封面，避免唱片中心闪烁
  const [stableCoverId, setStableCoverId] = useState<string | undefined>(initialCoverId)
  const firstTrackCoverId = items[0]?.coverId || initialCoverId || stableCoverId
  if (items[0]?.coverId && items[0].coverId !== stableCoverId) {
    setStableCoverId(items[0].coverId)
  }

  if (query.isPending && items.length === 0) return <LoadingState />
  if (query.isLoadingError && items.length === 0) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  const toolbar = (
    <ListToolbar
      kind="genreTracks"
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
          title: pinned ? (name || '流派') : '',
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
              <VinylDisc genreId={id} coverId={firstTrackCoverId} size={340} variant="detail" />
              <Text style={styles.name}>{name || '流派'}</Text>

              <View style={styles.actions}>
                <Pressable
                  style={styles.button}
                  onPress={() => void play(0)}
                  accessibilityRole="button"
                  accessibilityLabel="播放全部"
                >
                  <Icon name="play" size={iconSize.sm} color={colors.textPrimary} filled />
                  <Text style={styles.buttonLabel}>播放</Text>
                </Pressable>
                <Pressable
                  style={styles.button}
                  onPress={() => void play(0, true)}
                  accessibilityRole="button"
                  accessibilityLabel="随机播放"
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
            leading="cover"
            playing={current?.serverId === connection?.id && current?.trackId === item.id}
            onPress={() => void play(index)}
          />
        )}
        onEndReached={loadMore}
        ListEmptyComponent={<EmptyState text="这个流派下还没有歌曲" />}
        ListFooterComponent={
          total > 0 ? (
            <PaginationFooter
              loading={query.isFetchingNextPage}
              error={query.isFetchNextPageError ? query.error : undefined}
              onRetry={() => void query.fetchNextPage()}
            />
          ) : null
        }
      />

      {pinned && total > 0 ? <View style={styles.pinnedBar}>{toolbar}</View> : null}

      <TrackSelectionModal
        visible={selecting}
        items={items}
        source={{ kind: 'genre', id, label: name ? `流派 · ${name}` : '流派' }}
        leading="cover"
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
  list: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerRoot: { marginBottom: spacing.sm },
  coverBlock: { alignItems: 'center', gap: spacing.xs },
  toolbarSlot: {
    alignSelf: 'stretch',
    marginTop: spacing.xl + spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  pinnedBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    backgroundColor: colors.bgPrimary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  name: { ...typography.title, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.sm },
  meta: { ...typography.footnote, color: colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl + 4,
    paddingVertical: spacing.sm + 3,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
    minWidth: 120,
  },
  buttonLabel: { ...typography.headline, color: colors.textPrimary },
}))
