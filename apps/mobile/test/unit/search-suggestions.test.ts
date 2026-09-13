import { describe, expect, it } from 'vitest'
import type { SearchSuggestion } from '@qj/provider-api'
import { buildSuggestionRows, SUGGEST_ROW_LIMIT } from '../../src/lib/search-suggestions'

function track(id: string, title: string, artist = '歌手') {
  return {
    id,
    title,
    durationMs: 180_000,
    artists: [{ id: `${id}-a`, name: artist }],
    genres: [],
    isCue: false,
  }
}

function album(id: string, name: string, artist = '歌手') {
  return { id, name, artists: [{ id: `${id}-a`, name: artist }] }
}

function suggestion(overrides: Partial<SearchSuggestion> = {}): SearchSuggestion {
  return { tracks: [], albums: [], artists: [], playlists: [], ...overrides }
}

describe('搜索联想行构建', () => {
  it('没有数据时返回空列表（不发散、不抛错）', () => {
    expect(buildSuggestionRows(undefined)).toEqual([])
    expect(buildSuggestionRows(suggestion())).toEqual([])
  })

  it('歌曲优先，其次是专辑 / 艺术家 / 歌单', () => {
    const rows = buildSuggestionRows(
      suggestion({
        tracks: [track('t1', '七里香')],
        albums: [album('al1', '七里香')],
        artists: [{ id: 'ar1', name: '周杰伦' }],
        playlists: [{ id: 'p1', name: '深夜周杰伦' }],
      }),
    )
    expect(rows.map((row) => row.kind)).toEqual(['track', 'album', 'artist', 'playlist'])
    expect(rows.map((row) => row.label)).toEqual(['七里香', '七里香', '周杰伦', '深夜周杰伦'])
  })

  it('每类有配额，且总数不超过上限', () => {
    const many = {
      tracks: Array.from({ length: 10 }, (_, i) => track(`t${i}`, `歌${i}`)),
      albums: Array.from({ length: 10 }, (_, i) => album(`al${i}`, `专辑${i}`)),
      artists: Array.from({ length: 10 }, (_, i) => ({ id: `ar${i}`, name: `艺术家${i}` })),
      playlists: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `歌单${i}` })),
    }
    const rows = buildSuggestionRows(suggestion(many))
    expect(rows).toHaveLength(SUGGEST_ROW_LIMIT)
    // 歌曲最多 3 条，且整体顺序保持「歌曲 → 专辑 → 艺术家 → 歌单」
    expect(rows.filter((row) => row.kind === 'track')).toHaveLength(3)
    expect(rows[0]?.kind).toBe('track')
  })

  it('行 key 带类型前缀，同名条目不会撞 key', () => {
    const rows = buildSuggestionRows(
      suggestion({ tracks: [track('same', '同名')], albums: [album('same', '同名')] }),
    )
    expect(rows[0]?.key).toBe('track-same')
    expect(rows[1]?.key).toBe('album-same')
  })

  it('没有艺术家时副标题回落为「未知艺术家」', () => {
    const rows = buildSuggestionRows(suggestion({ tracks: [track('t1', '无署名', '')] }))
    expect(rows[0]?.hint).toBe('未知艺术家')
  })

  it('上限为 0 时不产出任何行', () => {
    const data = suggestion({ tracks: [track('t1', '七里香')] })
    expect(buildSuggestionRows(data, 0)).toEqual([])
  })
})
