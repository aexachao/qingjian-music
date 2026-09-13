import { useCallback, useEffect, useMemo, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import type { Genre } from '@qj/core-domain'
import { CollapsibleHeaderBar, LargeTitleHeader } from '@/components/collapsible-tab-header'
import { useConfirm } from '@/components/confirm-modal'
import { AlbumRow, ArtistRow, PlaylistRow } from '@/components/entity-row'
import { Icon, IconButton, iconSize, type IconName } from '@/components/icon'
import { EmptyState, ErrorState } from '@/components/list-states'
import { useToast } from '@/components/toast'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDebounced } from '@/lib/use-debounced'
import { useDetailHref } from '@/lib/detail-href'
import { useIsMenuOpen } from '@/lib/menu-guard'
import { clearRecentSearches, listRecentSearches, pushRecentSearch, removeRecentSearch } from '@/lib/recent-search'
import { buildSuggestionRows, SUGGEST_KIND_LABEL, type SuggestKind } from '@/lib/search-suggestions'
import { useServerSession } from '@/lib/server-session'
import { playTrackList } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/** 各分区在搜索页只露一小段，要看全部点分区标题右边的箭头 */
const TRACK_PREVIEW = 8
const ALBUM_PREVIEW = 4
const ARTIST_PREVIEW = 4
const PLAYLIST_PREVIEW = 4
const GENRE_LIMIT = 30
/** 流派卡片直接播放时取多少首 */
const GENRE_PLAY_SIZE = 100

const SUGGEST_ICON: Record<SuggestKind, IconName> = {
  track: 'tracks',
  album: 'albums',
  artist: 'artists',
  playlist: 'playlists',
}

/**
 * 搜索页：一个搜索框搜全部（歌曲 / 专辑 / 艺术家 / 歌单分区展示）。
 *
 * 输入框聚焦时展示「联想」下拉（走轻量的 suggest 接口，一次请求拿到各类目 top 命中），
 * 失焦或提交后展示完整分区结果；没有关键词时下面是搜索历史与流派卡片。
 */
export function SearchScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  // 支持带关键词进来：/search?q=周杰伦
  const { q } = useLocalSearchParams<{ q?: string }>()
  const [input, setInput] = useState(q ?? '')
  const [focused, setFocused] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const keyword = useDebounced(input.trim(), 300)
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const current = usePlayerStore(selectCurrent)
  const searching = Boolean(provider) && keyword.length > 0
  const canSearchPlaylists = Boolean(provider?.searchPlaylists && provider.capabilities.playlists !== 'none')

  // 联想只在输入框聚焦时展示：失焦后让位给完整结果，避免两套列表叠在一起
  const suggestEnabled =
    focused && searching && Boolean(provider?.capabilities.searchSuggest && provider?.suggest)

  const suggestions = useQuery({
    queryKey: ['search-suggest', connection?.id, keyword],
    enabled: suggestEnabled,
    queryFn: () => provider!.suggest!(keyword),
    staleTime: 60_000,
  })

  const tracks = useQuery({
    queryKey: ['search-preview-tracks', connection?.id, keyword],
    enabled: searching,
    queryFn: () => provider!.searchTracks(keyword, { page: 1, size: TRACK_PREVIEW }),
  })
  const albums = useQuery({
    queryKey: ['search-preview-albums', connection?.id, keyword],
    enabled: searching,
    queryFn: () => provider!.searchAlbums(keyword, { page: 1, size: ALBUM_PREVIEW }),
  })
  const artists = useQuery({
    queryKey: ['search-preview-artists', connection?.id, keyword],
    enabled: searching,
    queryFn: () => provider!.searchArtists(keyword, { page: 1, size: ARTIST_PREVIEW }),
  })
  const playlists = useQuery({
    queryKey: ['search-preview-playlists', connection?.id, keyword],
    enabled: searching && canSearchPlaylists,
    queryFn: () => provider!.searchPlaylists!(keyword, { page: 1, size: PLAYLIST_PREVIEW }),
  })
  const genres = useQuery({
    queryKey: ['search-genres', connection?.id],
    enabled: Boolean(provider) && provider!.capabilities.genres,
    queryFn: () => provider!.genres({ page: 1, size: GENRE_LIMIT }),
  })

  // 搜索历史只在进页面时读一次；后续增删都用写入函数的返回值直接刷 UI，避免多读一次存储
  useEffect(() => {
    let alive = true
    void listRecentSearches().then((list) => {
      if (alive) setRecent(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const trackItems = tracks.data?.items ?? []
  const albumItems = albums.data?.items ?? []
  const artistItems = artists.data?.items ?? []
  const playlistItems = playlists.data?.items ?? []
  const searchError = tracks.error ?? albums.error ?? artists.error ?? playlists.error
  const nothingFound =
    searching &&
    !tracks.isPending &&
    !albums.isPending &&
    !artists.isPending &&
    !playlists.isPending &&
    trackItems.length === 0 &&
    albumItems.length === 0 &&
    artistItems.length === 0 &&
    playlistItems.length === 0

  /**
   * 提交一次搜索：写入历史 + 收起键盘 + 关闭联想，让下面的完整结果露出来。
   * 只在「提交」时记历史，而不是跟着输入防抖记 —— 否则「周」「周杰」「周杰伦」
   * 会被当成三条历史，历史列表立刻被前缀刷满。
   */
  const commitSearch = useCallback((value: string) => {
    const next = value.trim()
    if (!next) return
    setInput(next)
    setFocused(false)
    Keyboard.dismiss()
    void pushRecentSearch(next).then(setRecent)
  }, [])

  const onRemoveRecent = useCallback((value: string) => {
    void removeRecentSearch(value).then(setRecent)
  }, [])

  const onClearRecent = useCallback(() => {
    confirm({
      title: '清空搜索历史？',
      message: '清空后无法恢复。',
      confirmText: '清空',
      destructive: true,
      onConfirm: () => {
        void clearRecentSearches().then(() => setRecent([]))
      },
    })
  }, [confirm])

  /** 联想下拉的行：歌曲优先，其次是专辑 / 艺术家 / 歌单（行构建逻辑在 lib/search-suggestions 里单测） */
  const suggestionRows = useMemo(() => buildSuggestionRows(suggestions.data), [suggestions.data])

  /** 流派卡片上的播放键：直接把这个流派放起来，不用先进二级页 */
  const playGenre = useCallback(
    async (genre: Genre) => {
      if (!provider || !connection) return
      try {
        const page = await provider.genreTracks(genre.id, { page: 1, size: GENRE_PLAY_SIZE })
        if (page.items.length === 0) {
          toast('这个流派下还没有歌曲')
          return
        }
        await playTrackList({
          provider,
          serverId: connection.id,
          tracks: page.items,
          startIndex: 0,
          source: { kind: 'genre', id: genre.id, label: `流派 · ${genre.name}` },
        })
        toast(`开始播放 ${genre.name}`)
      } catch {
        toast('播放失败，请稍后再试')
      }
    },
    [connection, provider, toast],
  )

  const isMenuOpen = useIsMenuOpen()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  const showSuggestions = suggestEnabled && input.trim().length > 0

  return (
    <View style={{ flex: 1 }}>
      <CollapsibleHeaderBar title="搜索" scrollY={scrollY} />
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        keyboardShouldPersistTaps="handled"
      >
        <LargeTitleHeader title="搜索" scrollY={scrollY} />
        <View style={styles.searchBox}>
          <Icon name="search" size={iconSize.md} color={colors.iconDim} />
          <TextInput
            value={input}
            onChangeText={setInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => commitSearch(input)}
            placeholder="搜索歌曲、专辑、艺术家"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="搜索曲库"
          />
        </View>

        {showSuggestions ? (
          <View style={styles.suggestBox}>
            {/* 第一行永远是「直接搜这个词」：即使联想没命中，也有一条明确的出口 */}
            <Pressable
              style={styles.suggestRow}
              onPress={() => commitSearch(input)}
              accessibilityRole="button"
              accessibilityLabel={`搜索 ${input.trim()}`}
            >
              <Icon name="search" size={iconSize.md} color={colors.textSecondary} />
              <Text numberOfLines={1} style={styles.suggestLabel}>
                搜索「{input.trim()}」
              </Text>
            </Pressable>

            {suggestionRows.map((row) => (
              <Pressable
                key={row.key}
                style={styles.suggestRow}
                onPress={() => commitSearch(row.label)}
                accessibilityRole="button"
                accessibilityLabel={`${SUGGEST_KIND_LABEL[row.kind]} ${row.label}`}
              >
                <Icon name={SUGGEST_ICON[row.kind]} size={iconSize.md} color={colors.textSecondary} />
                <Text numberOfLines={1} style={styles.suggestLabel}>
                  {row.label}
                </Text>
                <Text numberOfLines={1} style={styles.suggestHint}>
                  {row.hint}
                </Text>
              </Pressable>
            ))}

            {suggestions.isError ? (
              <Text style={styles.suggestEmpty}>联想加载失败，直接回车搜索即可</Text>
            ) : null}
          </View>
        ) : null}

        {!showSuggestions && searching ? (
          <>
            {searchError ? (
              <ErrorState
                error={searchError}
                onRetry={() => {
                  void tracks.refetch()
                  void albums.refetch()
                  void artists.refetch()
                  if (canSearchPlaylists) void playlists.refetch()
                }}
              />
            ) : null}
            {!searchError && trackItems.length > 0 ? (
              <View>
                <SectionHeader
                  title="歌曲"
                  onPress={() => router.push({ pathname: '/search/tracks', params: { q: keyword } })}
                />
                {trackItems.map((track, index) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={index}
                    leading="cover"
                    playing={current?.serverId === connection?.id && current?.trackId === track.id}
                    onPress={() => {
                      if (!provider || !connection) return
                      void playTrackList({
                        provider,
                        serverId: connection.id,
                        tracks: trackItems,
                        startIndex: index,
                        source: { kind: 'search', label: `搜索 · ${keyword}` },
                      })
                    }}
                  />
                ))}
              </View>
            ) : null}

            {!searchError && albumItems.length > 0 ? (
              <View>
                <SectionHeader
                  title="专辑"
                  onPress={() => router.push({ pathname: '/search/albums', params: { q: keyword } })}
                />
                {albumItems.map((album) => (
                  <AlbumRow key={album.id} album={album} />
                ))}
              </View>
            ) : null}

            {!searchError && artistItems.length > 0 ? (
              <View>
                <SectionHeader
                  title="艺术家"
                  onPress={() => router.push({ pathname: '/search/artists', params: { q: keyword } })}
                />
                {artistItems.map((artist) => (
                  <ArtistRow key={artist.id} artist={artist} />
                ))}
              </View>
            ) : null}

            {!searchError && canSearchPlaylists && playlistItems.length > 0 ? (
              <View>
                <SectionHeader
                  title="歌单"
                  onPress={() =>
                    router.push({ pathname: '/search/playlists' as never, params: { q: keyword } })
                  }
                />
                {playlistItems.map((playlist) => (
                  <PlaylistRow key={playlist.id} playlist={playlist} />
                ))}
              </View>
            ) : null}

            {!searchError && nothingFound ? <EmptyState text="没有找到匹配的结果" /> : null}
          </>
        ) : null}

        {!showSuggestions && !searching ? (
          <View>
            {recent.length > 0 ? (
              <View>
                <View style={styles.recentHeader}>
                  <Text style={styles.sectionTitle}>最近搜索</Text>
                  <Pressable
                    onPress={onClearRecent}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="清空搜索历史"
                  >
                    <Text style={styles.recentClear}>清空</Text>
                  </Pressable>
                </View>
                {recent.map((item) => (
                  <View key={item} style={styles.recentRow}>
                    <Pressable
                      style={styles.recentMain}
                      onPress={() => commitSearch(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`搜索历史 ${item}`}
                    >
                      <Icon name="history" size={iconSize.md} color={colors.textSecondary} />
                      <Text numberOfLines={1} style={styles.recentText}>
                        {item}
                      </Text>
                    </Pressable>
                    <IconButton
                      name="close"
                      size={iconSize.sm}
                      color={colors.iconDim}
                      onPress={() => onRemoveRecent(item)}
                      accessibilityLabel={`删除搜索历史 ${item}`}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>按流派收听</Text>
            {genres.isError ? (
              <ErrorState error={genres.error} onRetry={() => void genres.refetch()} />
            ) : (
              <View style={styles.genreGrid}>
              {(genres.data?.items ?? []).map((genre) => (
                <View key={genre.id} style={styles.genreCard}>
                  <Pressable
                    style={styles.genreMain}
                    onPress={() => router.push(href.genre(genre.id, genre.name))}
                    accessibilityRole="button"
                    accessibilityLabel={`流派 ${genre.name}`}
                  >
                    <Text numberOfLines={1} style={styles.genreName}>
                      {genre.name}
                    </Text>
                    {genre.trackCount ? <Text style={styles.genreMeta}>{genre.trackCount} 首</Text> : null}
                  </Pressable>
                  <IconButton
                    name="play"
                    size={iconSize.md}
                    color={colors.accent}
                    onPress={() => void playGenre(genre)}
                    accessibilityLabel={`播放流派 ${genre.name}`}
                  />
                </View>
              ))}
              </View>
            )}
          </View>
        ) : null}
      </Animated.ScrollView>

      {isMenuOpen ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {}}
        />
      ) : null}
    </View>
  )
}

/** 分区标题：整行可点，右侧箭头表示「查看全部」 */
function SectionHeader({ title, onPress }: { title: string; onPress: () => void }) {
  const colors = useThemeColors()
  const styles = useStyles()
  return (
    <Pressable
      style={styles.sectionHeader}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`查看全部${title}结果`}
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      <Icon name="chevronRight" size={iconSize.md} color={colors.textQuaternary} />
    </Pressable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  content: { paddingHorizontal: spacing.lg, paddingTop: 0, gap: spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderInput,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: spacing.sm + 2, ...typography.callout, color: colors.textPrimary },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, paddingVertical: spacing.sm },
  // 联想下拉：和搜索框同一套圆角与底色，视觉上像它的延伸
  suggestBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  suggestLabel: { flexShrink: 1, ...typography.callout, color: colors.textPrimary },
  suggestHint: { flex: 1, ...typography.caption, color: colors.textTertiary, textAlign: 'right' },
  suggestEmpty: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  // 最近搜索
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  recentClear: { ...typography.callout, color: colors.iconMid },
  recentRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  recentText: { flexShrink: 1, ...typography.callout, color: colors.textPrimary },
  // 两列流派卡片：和首页入口卡片同一套尺寸语言
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  genreCard: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
  },
  genreMain: { flex: 1, gap: 2, paddingVertical: spacing.xs },
  genreName: { ...typography.callout, color: colors.textPrimary },
  genreMeta: { ...typography.caption, color: colors.textTertiary },
}))
