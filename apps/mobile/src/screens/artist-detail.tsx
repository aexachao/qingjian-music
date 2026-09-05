import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { EmptyState, ErrorState, FooterLoader, LoadingState } from '@/components/list-states'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, toggleShuffle } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

const TOP_TRACK_COUNT = 5

export function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { provider, connection } = useServerSession()
  const { width } = useWindowDimensions()
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const playingQid = usePlayerStore(selectCurrent)?.qid

  const columns = width >= 700 ? 3 : 2
  const gap = spacing.md
  const itemWidth = (width - spacing.lg * 2 - gap * (columns - 1)) / columns

  const albums = usePagedQuery({
    queryKey: ['artist-albums', connection?.id, id],
    enabled: Boolean(provider && id),
    fetchPage: (page) => provider!.artistAlbums(id, { page, size: 40 }),
  })

  // 热门歌曲：直接取该艺术家曲目的第一页
  const topTracks = useQuery({
    queryKey: ['artist-top-tracks', connection?.id, id],
    enabled: Boolean(provider && id),
    queryFn: () => provider!.artistTracks(id, { page: 1, size: 50 }),
  })

  const tracks = topTracks.data?.items ?? []
  const artistName = tracks[0]?.artists.find((artist) => artist.id === id)?.name ?? albums.items[0]?.artists[0]?.name

  async function playTop(startIndex: number, shuffle = false) {
    if (!provider || !connection || tracks.length === 0) return
    await playTrackList({
      provider,
      serverId: connection.id,
      tracks,
      startIndex,
      source: { kind: 'artist', id, label: artistName ? `艺术家 · ${artistName}` : '艺术家' },
    })
    if (shuffle) await toggleShuffle()
  }

  // 标题要在早退之前就挂上，否则加载时导航栏是空的
  const title = <Stack.Screen options={{ title: artistName ?? '艺术家' }} />

  if (albums.query.isPending) return <>{title}<LoadingState /></>
  if (albums.query.isError)
    return (
      <>
        {title}
        <ErrorState error={albums.query.error} onRetry={() => void albums.query.refetch()} />
      </>
    )

  return (
    <>
      {title}
    <FlatList
      data={albums.items}
      key={columns}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      columnWrapperStyle={{ gap }}
      ListEmptyComponent={<EmptyState text="这位艺术家还没有专辑" />}
      ListHeaderComponent={
        <View style={styles.header}>
          <CoverImage coverId={tracks[0]?.artists[0]?.coverId} size={120} borderRadius={60} />
          <Text style={styles.name}>{artistName ?? '艺术家'}</Text>
          <Text style={styles.meta}>
            {albums.total ? `${albums.total} 张专辑` : ''}
            {topTracks.data?.total ? ` · ${topTracks.data.total} 首` : ''}
          </Text>
          <View style={styles.actions}>
            {/* 一屏只留一个主操作：播放用强调色实心（对应 web --ds-action-primary-bg） */}
            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => void playTop(0)}
              accessibilityRole="button"
              accessibilityLabel="播放热门歌曲"
            >
              <Icon name="play" size={iconSize.sm} color={colors.textOnAccent} filled />
              <Text style={[styles.buttonLabel, styles.buttonLabelPrimary]}>播放</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() => void playTop(0, true)}
              accessibilityRole="button"
              accessibilityLabel="随机播放"
            >
              <Icon name="shuffle" size={iconSize.sm} color={colors.textPrimary} />
              <Text style={styles.buttonLabel}>随机播放</Text>
            </Pressable>
          </View>

          {tracks.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>热门歌曲</Text>
              {tracks.slice(0, TOP_TRACK_COUNT).map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  leading="cover"
                  playing={playingQid === `${connection?.id}:${track.id}`}
                  onPress={() => void playTop(index)}
                />
              ))}
            </View>
          ) : null}

          {albums.items.length > 0 ? <Text style={styles.sectionTitle}>专辑</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Link href={href.album(item.id)} asChild>
          <Pressable style={{ width: itemWidth }} accessibilityRole="button" accessibilityLabel={`专辑 ${item.name}`}>
            <CoverImage coverId={item.coverId} size={itemWidth} />
            <Text numberOfLines={1} style={styles.albumName}>
              {item.name}
            </Text>
            {item.releaseDate ? <Text style={styles.albumYear}>{item.releaseDate.slice(0, 4)}</Text> : null}
          </Pressable>
        </Link>
      )}
      onEndReached={albums.loadMore}
      ListFooterComponent={<FooterLoader loading={albums.query.isFetchingNextPage} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
    />
    </>
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  header: { gap: spacing.xs, marginBottom: spacing.lg, alignItems: 'center' },
  name: { ...typography.title, color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' },
  meta: { ...typography.footnote, color: colors.textSecondary },
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
  section: { alignSelf: 'stretch', marginTop: spacing.lg },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, alignSelf: 'flex-start', marginTop: spacing.lg },
  albumName: { ...typography.subhead, color: colors.textPrimary, marginTop: spacing.sm },
  albumYear: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
})
