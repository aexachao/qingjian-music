import type { SearchSuggestion } from '@qj/provider-api'

/**
 * 搜索联想（下拉）的纯数据层：把 suggest 接口返回的四类实体摊平成一份可渲染的行列表。
 * 不依赖 RN，方便直接跑单测；图标与文案映射留在 `screens/search.tsx`。
 */

export type SuggestKind = 'track' | 'album' | 'artist' | 'playlist'

export interface SuggestionRow {
  key: string
  kind: SuggestKind
  label: string
  hint: string
}

/** 联想下拉最多展示几行（不含最上面那行「搜索 “xxx”」） */
export const SUGGEST_ROW_LIMIT = 6

/**
 * 各类型取前几条：歌曲最相关，多给一条；其余各 2 条。
 * 配额之和大于上限，所以上限始终生效，且截断永远先砍掉排在后面的类型。
 */
const KIND_QUOTA: Record<SuggestKind, number> = { track: 3, album: 2, artist: 2, playlist: 2 }

export const SUGGEST_KIND_LABEL: Record<SuggestKind, string> = {
  track: '歌曲',
  album: '专辑',
  artist: '艺术家',
  playlist: '歌单',
}

function artistsText(artists: { name: string }[]): string {
  return artists.map((artist) => artist.name).join(' / ') || '未知艺术家'
}

export function buildSuggestionRows(
  data: SearchSuggestion | undefined,
  limit: number = SUGGEST_ROW_LIMIT,
): SuggestionRow[] {
  if (!data || limit <= 0) return []
  const rows: SuggestionRow[] = []
  // 按 kind 顺序依次填充，超出上限后后面的类型自然被丢掉
  const push = (kind: SuggestKind, key: string, label: string, hint: string) => {
    if (rows.length >= limit) return
    rows.push({ key, kind, label, hint })
  }

  for (const track of data.tracks.slice(0, KIND_QUOTA.track)) {
    push('track', `track-${track.id}`, track.title, artistsText(track.artists))
  }
  for (const album of data.albums.slice(0, KIND_QUOTA.album)) {
    push('album', `album-${album.id}`, album.name, artistsText(album.artists))
  }
  for (const artist of data.artists.slice(0, KIND_QUOTA.artist)) {
    push('artist', `artist-${artist.id}`, artist.name, SUGGEST_KIND_LABEL.artist)
  }
  for (const playlist of data.playlists.slice(0, KIND_QUOTA.playlist)) {
    push('playlist', `playlist-${playlist.id}`, playlist.name, SUGGEST_KIND_LABEL.playlist)
  }
  return rows
}
