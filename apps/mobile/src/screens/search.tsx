import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import type { Genre } from '@qj/core-domain'
import { AlbumRow, ArtistRow } from '@/components/entity-row'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { EmptyState } from '@/components/list-states'
import { useToast } from '@/components/toast'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDebounced } from '@/lib/use-debounced'
import { useDetailHref } from '@/lib/detail-href'
import { useServerSession } from '@/lib/server-session'
import { playTrackList } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 各分区在搜索页只露一小段，要看全部点分区标题右边的箭头 */
const TRACK_PREVIEW = 8
const ALBUM_PREVIEW = 4
const ARTIST_PREVIEW = 4
const GENRE_LIMIT = 30
/** 流派卡片直接播放时取多少首 */
const GENRE_PLAY_SIZE = 100

/**
 * 搜索页：一个搜索框搜全部（歌曲 / 专辑 / 艺术家分区展示），
 * 没输关键词时下面是流派卡片，点一下就能听某个流派。
 */
export function SearchScreen() {
  const { provider, connection } = useServerSession()
  // 支持带关键词进来：/search?q=周杰伦
  const { q } = useLocalSearchParams<{ q?: string }>()
  const [input, setInput] = useState(q ?? '')
  const keyword = useDebounced(input.trim(), 300)
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const router = useRouter()
  const toast = useToast()
  const playingQid = usePlayerStore(selectCurrent)?.qid
  const searching = Boolean(provider) && keyword.length > 0

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
  const genres = useQuery({
    queryKey: ['search-genres', connection?.id],
    enabled: Boolean(provider) && provider!.capabilities.genres,
    queryFn: () => provider!.genres({ page: 1, size: GENRE_LIMIT }),
  })

  const trackItems = tracks.data?.items ?? []
  const albumItems = albums.data?.items ?? []
  const artistItems = artists.data?.items ?? []
  const nothingFound =
    searching &&
    !tracks.isPending &&
    !albums.isPending &&
    !artists.isPending &&
    trackItems.length === 0 &&
    albumItems.length === 0 &&
    artistItems.length === 0

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

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.searchBox}>
        <Icon name="search" size={iconSize.md} color={colors.iconDim} />
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

      {searching ? (
        <>
          {trackItems.length > 0 ? (
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
                  playing={playingQid === `${connection?.id}:${track.id}`}
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

          {albumItems.length > 0 ? (
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

          {artistItems.length > 0 ? (
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

          {nothingFound ? <EmptyState text="没有找到匹配的结果" /> : null}
        </>
      ) : (
        <View>
          <Text style={styles.sectionTitle}>按流派收听</Text>
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
        </View>
      )}
    </ScrollView>
  )
}

/** 分区标题：整行可点，右侧箭头表示「查看全部」 */
function SectionHeader({ title, onPress }: { title: string; onPress: () => void }) {
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

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
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
})
