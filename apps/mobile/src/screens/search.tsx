import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Link } from 'expo-router'
import type { Album, Artist, Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { EmptyState, FooterLoader } from '@/components/list-states'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDebounced } from '@/lib/use-debounced'
import { useDetailHref } from '@/lib/detail-href'
import { usePagedQuery } from '@/lib/paged-query'
import { useServerSession } from '@/lib/server-session'
import { playTrackList } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

type Scope = 'tracks' | 'albums' | 'artists'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'tracks', label: '歌曲' },
  { key: 'albums', label: '专辑' },
  { key: 'artists', label: '艺术家' },
]

export function SearchScreen() {
  const { provider, connection } = useServerSession()
  const [input, setInput] = useState('')
  const [scope, setScope] = useState<Scope>('tracks')
  const keyword = useDebounced(input.trim(), 300)
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const playingQid = usePlayerStore(selectCurrent)?.qid
  const active = Boolean(provider) && keyword.length > 0

  const tracks = usePagedQuery<Track>({
    queryKey: ['search-tracks', connection?.id, keyword],
    enabled: active && scope === 'tracks',
    fetchPage: (page) => provider!.searchTracks(keyword, { page, size: 50 }),
  })
  const albums = usePagedQuery<Album>({
    queryKey: ['search-albums', connection?.id, keyword],
    enabled: active && scope === 'albums',
    fetchPage: (page) => provider!.searchAlbums(keyword, { page, size: 40 }),
  })
  const artists = usePagedQuery<Artist>({
    queryKey: ['search-artists', connection?.id, keyword],
    enabled: active && scope === 'artists',
    fetchPage: (page) => provider!.searchArtists(keyword, { page, size: 50 }),
  })

  const header = (
    <View style={styles.header}>
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="搜索歌曲、专辑、艺术家"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="搜索曲库"
        />
      </View>
      <View style={styles.scopes}>
        {SCOPES.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setScope(item.key)}
            style={[styles.scope, scope === item.key && styles.scopeActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: scope === item.key }}
            accessibilityLabel={`按${item.label}搜索`}
          >
            <Text style={[styles.scopeLabel, scope === item.key && styles.scopeLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )

  const empty = keyword.length === 0 ? '输入关键词开始搜索' : '没有找到匹配的结果'

  if (scope === 'albums') {
    return (
      <FlatList
        data={albums.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState text={empty} />}
        renderItem={({ item }) => (
          <Link href={href.album(item.id)} asChild>
            <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`专辑 ${item.name}`}>
              <CoverImage coverId={item.coverId} size={52} borderRadius={radius.sm} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={styles.rowSubtitle}>
                  {item.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
                </Text>
              </View>
            </Pressable>
          </Link>
        )}
        onEndReached={albums.loadMore}
        ListFooterComponent={<FooterLoader loading={albums.query.isFetchingNextPage} />}
      />
    )
  }

  if (scope === 'artists') {
    return (
      <FlatList
        data={artists.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState text={empty} />}
        renderItem={({ item }) => (
          <Link href={href.artist(item.id)} asChild>
            <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={`艺术家 ${item.name}`}>
              <CoverImage coverId={item.coverId} size={52} borderRadius={26} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {item.name}
                </Text>
                {item.trackCount ? <Text style={styles.rowSubtitle}>{item.trackCount} 首</Text> : null}
              </View>
            </Pressable>
          </Link>
        )}
        onEndReached={artists.loadMore}
        ListFooterComponent={<FooterLoader loading={artists.query.isFetchingNextPage} />}
      />
    )
  }

  return (
    <FlatList
      data={tracks.items}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState text={empty} />}
      renderItem={({ item, index }) => (
        <TrackRow
          track={item}
          index={index}
          leading="cover"
          playing={playingQid === `${connection?.id}:${item.id}`}
          onPress={() => {
            if (!provider || !connection) return
            void playTrackList({
              provider,
              serverId: connection.id,
              tracks: tracks.items,
              startIndex: index,
              source: { kind: 'search', label: `搜索 · ${keyword}` },
            })
          }}
        />
      )}
      onEndReached={tracks.loadMore}
      ListFooterComponent={<FooterLoader loading={tracks.query.isFetchingNextPage} />}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchIcon: { fontSize: 14 },
  input: { flex: 1, paddingVertical: spacing.sm + 2, ...typography.callout, color: colors.text },
  scopes: { flexDirection: 'row', gap: spacing.sm },
  scope: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  scopeActive: { backgroundColor: colors.accent },
  scopeLabel: { ...typography.footnote, color: colors.textSecondary },
  scopeLabelActive: { color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.callout, color: colors.text },
  rowSubtitle: { ...typography.caption, color: colors.textSecondary },
})
