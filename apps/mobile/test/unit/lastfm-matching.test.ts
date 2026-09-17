import { describe, expect, it } from 'vitest'
import type { Track } from '@qj/core-domain'
import { cleanSongTitle, fetchArtistPortrait, matchLocalTracks, type LastFmTrack } from '../../src/lib/lastfm'

function makeMockTrack(id: string, title: string, isFavorite = false): Track {
  return {
    id,
    title,
    durationMs: 200000,
    artists: [{ id: 'artist-1', name: '周杰伦' }],
    genres: [],
    isCue: false,
    isFavorite,
  }
}

describe('Last.fm 歌曲清洗与本地对齐算法', () => {
  it('cleanSongTitle 能够正确剥离各类括号、版本信息与标点空白', () => {
    expect(cleanSongTitle('一路向北 (Live)')).toBe('一路向北')
    expect(cleanSongTitle('晴天 [FLAC 24bit/96kHz]')).toBe('晴天')
    expect(cleanSongTitle('七里香（2022 重置版）')).toBe('七里香')
    expect(cleanSongTitle('Mojito · 莫吉托 (伴奏)')).toBe('mojito莫吉托')
    expect(cleanSongTitle('')).toBe('')
  })

  it('matchLocalTracks 能够按照 Last.fm 全网热度顺序提取本地已拥有的歌曲', () => {
    const localTracks: Track[] = [
      makeMockTrack('1', '枫'),
      makeMockTrack('2', '晴天 (2003)'),
      makeMockTrack('3', '简单爱'),
      makeMockTrack('4', '一路向北 [Live]'),
      makeMockTrack('5', '夜曲'),
      makeMockTrack('6', '七里香'),
    ]

    const topTracks: LastFmTrack[] = [
      { name: '一路向北' }, // match #4
      { name: '晴天' },     // match #2
      { name: '七里香' },   // match #6
      { name: '青花瓷' },   // local not present!
      { name: '夜曲' },     // match #5
    ]

    const result = matchLocalTracks(localTracks, topTracks, 4)

    // Expected order: 一路向北, 晴天, 七里香, 夜曲
    expect(result.map((t) => t.id)).toEqual(['4', '2', '6', '5'])
  })

  it('当全网命中不足时，优先使用本地收藏歌曲补足至 maxCount', () => {
    const localTracks: Track[] = [
      makeMockTrack('1', '未上榜的冷门歌A', true), // favorite!
      makeMockTrack('2', '晴天'),                 // matches top
      makeMockTrack('3', '未上榜的冷门歌B', false),
    ]

    const topTracks: LastFmTrack[] = [
      { name: '晴天' },
      { name: '稻香' }, // not in local
    ]

    const result = matchLocalTracks(localTracks, topTracks, 3)

    // 1st: 晴天 (matched)
    // 2nd: 冷门歌A (favorite)
    // 3rd: 冷门歌B (remaining)
    expect(result.map((t) => t.id)).toEqual(['2', '1', '3'])
  })

  it('当没有网络或没有 Top 榜单时，退化返回本地曲目前 N 首', () => {
    const localTracks: Track[] = [
      makeMockTrack('1', '歌A'),
      makeMockTrack('2', '歌B'),
      makeMockTrack('3', '歌C'),
    ]

    const result = matchLocalTracks(localTracks, [], 2)
    expect(result.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('fetchArtistPortrait 空值安全防护', async () => {
    expect(await fetchArtistPortrait('')).toBeNull()
    expect(await fetchArtistPortrait('   ')).toBeNull()
  })
})
