import { useCallback, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import type { Album, Track } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize, type IconName } from '@/components/icon'
import { useToast } from '@/components/toast'
import { TrackRow } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { useDetailHref } from '@/lib/detail-href'
import { useServerSession } from '@/lib/server-session'
import { playTrackList, startRadio } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 首页展示条数：够一屏扫一眼就行，要全部再点进二级页 */
const RECENT_TRACKS = 5
const RECENT_ALBUMS = 12
const ALBUM_TILE = 132

/** 入口卡片：要么跳页面（href），要么直接触发播放（action） */
interface EntryCard {
  key: string
  label: string
  icon: IconName
  /** 写成字面量联合，才能过 expo-router 的类型化路由检查 */
  href?: '/home/history' | '/home/favorites' | '/home/playlists' | '/home/tracks'
  action?: 'radio'
  /** 需要后端支持哪项能力才显示 */
  requires?: 'favorites' | 'playHistory' | 'playlists' | 'radio'
}

const CARDS: readonly EntryCard[] = [
  { key: 'radio', label: '漫游', icon: 'radio', action: 'radio', requires: 'radio' },
  { key: 'favorites', label: '我喜欢的', icon: 'heart', href: '/home/favorites', requires: 'favorites' },
  { key: 'history', label: '最近播放', icon: 'recentlyPlayed', href: '/home/history', requires: 'playHistory' },
  { key: 'playlists', label: '歌单', icon: 'playlists', href: '/home/playlists', requires: 'playlists' },
]

/** 首页：四个入口卡片 + 最近添加歌曲 + 最近添加专辑，对齐飞牛音乐 web 端首页 */
export function HomeScreen() {
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()
  const href = useDetailHref()
  const router = useRouter()
  const toast = useToast()
  const current = usePlayerStore(selectCurrent)
  const [startingRadio, setStartingRadio] = useState(false)

  const cards = useMemo(() => {
    const capabilities = provider?.capabilities
    return CARDS.filter((card) => {
      if (!card.requires) return true
      if (!capabilities) return false
      if (card.requires === 'favorites') return capabilities.favorites
      if (card.requires === 'playHistory') return capabilities.playHistory
      if (card.requires === 'radio') return capabilities.radio
      return capabilities.playlists !== 'none'
    })
  }, [provider])

  const recentTracks = useQuery({
    queryKey: ['home', 'recent-tracks', connection?.id],
    enabled: Boolean(provider),
    queryFn: () => provider!.tracks({ page: 1, size: RECENT_TRACKS, sort: { field: 'createdAt', order: 'desc' } }),
  })

  const recentAlbums = useQuery({
    queryKey: ['home', 'recent-albums', connection?.id],
    enabled: Boolean(provider),
    queryFn: () => provider!.albums({ page: 1, size: RECENT_ALBUMS, sort: { field: 'createdAt', order: 'desc' } }),
  })

  const tracks: Track[] = recentTracks.data?.items ?? []
  const albums: Album[] = recentAlbums.data?.items ?? []

  /** 漫游：服务端按口味推歌，边听边续，不跳页面，用迷你条 + 提示告诉用户已经开始 */
  const onRadio = useCallback(async () => {
    if (!provider || !connection || startingRadio) return
    setStartingRadio(true)
    try {
      await startRadio(provider, connection.id)
      toast('漫游已开始，随时切歌')
    } catch {
      toast('漫游启动失败，请稍后再试')
    } finally {
      setStartingRadio(false)
    }
  }, [connection, provider, startingRadio, toast])

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.cards}>
        {cards.map((card) => {
          const primary = card.action === 'radio'
          const inner = (
            <>
              <Icon
                name={card.icon}
                size={iconSize.lg}
                color={primary ? colors.textOnAccent : colors.accent}
              />
              <Text style={[styles.cardLabel, primary && styles.cardLabelPrimary]}>{card.label}</Text>
            </>
          )
          // 漫游是这一屏唯一的主操作，用强调色实心；其余是普通入口
          if (card.href) {
            return (
              <Link key={card.key} href={card.href} asChild>
                <Pressable style={styles.card} accessibilityRole="button" accessibilityLabel={card.label}>
                  {inner}
                </Pressable>
              </Link>
            )
          }
          return (
            <Pressable
              key={card.key}
              style={[styles.card, styles.cardPrimary, startingRadio && styles.cardBusy]}
              onPress={() => void onRadio()}
              accessibilityRole="button"
              accessibilityLabel="开始漫游，随机播放整个音乐库"
              accessibilityState={{ busy: startingRadio }}
            >
              {inner}
            </Pressable>
          )
        })}
      </View>

      <SectionHeader title="最近添加歌曲" onPress={() => router.push('/home/recent-tracks')} />
      {tracks.map((track, index) => (
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
              tracks,
              startIndex: index,
              source: { kind: 'tracks', label: '最近添加' },
            })
          }}
        />
      ))}

      <SectionHeader title="最近添加专辑" onPress={() => router.push('/home/albums')} />
      <FlatList
        horizontal
        data={albums}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.albumRow}
        renderItem={({ item }) => (
          <Link href={href.album(item.id)} asChild>
            <Pressable style={styles.albumTile} accessibilityRole="button" accessibilityLabel={item.name}>
              <CoverImage coverId={item.coverId} size={ALBUM_TILE} borderRadius={radius.md} />
              <Text numberOfLines={1} style={styles.albumName}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={styles.albumArtist}>
                {item.artists.map((artist) => artist.name).join(' / ') || '未知艺术家'}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </ScrollView>
  )
}

/** 分区标题：整行可点，右侧箭头是「还有更多」的信号 */
function SectionHeader({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onPress} accessibilityRole="button" accessibilityLabel={`查看全部${title}`}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Icon name="chevronRight" size={iconSize.md} color={colors.textQuaternary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  // 两列卡片：靠 flexWrap + 48% 宽度自适应屏宽，不写死像素
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  card: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
  },
  cardPrimary: { backgroundColor: colors.accent },
  cardBusy: { opacity: 0.6 },
  cardLabel: { ...typography.callout, color: colors.textPrimary },
  cardLabelPrimary: { color: colors.textOnAccent },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginTop: spacing.sm,
  },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  albumRow: { gap: spacing.md, paddingVertical: spacing.xs },
  albumTile: { width: ALBUM_TILE, gap: spacing.xs },
  albumName: { ...typography.subhead, color: colors.textPrimary },
  albumArtist: { ...typography.caption, color: colors.textTertiary },
})
