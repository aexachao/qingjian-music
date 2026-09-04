import { describe, expect, it } from 'vitest'
import { extractLyricText, formatSort, mapTrack, parseLyrics } from '../../src/mappers'
import { fnTrackSchema } from '../../src/schemas'

const rawTrack = {
  guid: 'c9ff3ff3f9d14262a1d11f884356b263',
  title: '粉红色的旋舞 (春)',
  coverId: null,
  year: null,
  discNo: 1,
  trackNo: 2,
  isrc: 'TWC010401301',
  duration: 170578,
  isCue: false,
  createdAt: 1788402125,
  updatedAt: 1788402125,
  album: {
    guid: 'dbed4f1a8b7d44f1a5063fef00d4dc06',
    name: '三颗猫饼干',
    coverId: 'album_8f0738c1f8ff4f4f99c2a04d2a25d63d',
    releaseDate: '2004-04-26',
    barcode: '600568527324',
  },
  artists: [{ guid: '7b744c4bab81490c8f6a015102857f96', name: '何真真', coverId: 'artist_cb5d' }],
  genres: [],
}

describe('mapTrack', () => {
  it('把真实响应映射成领域模型，null 统一变 undefined', () => {
    const track = mapTrack(fnTrackSchema.parse(rawTrack))
    expect(track.id).toBe(rawTrack.guid)
    expect(track.durationMs).toBe(170578)
    expect(track.year).toBeUndefined()
    expect(track.isCue).toBe(false)
    expect(track.artists.map((a) => a.name)).toEqual(['何真真'])
    expect(track.album?.name).toBe('三颗猫饼干')
  })

  it('曲目没有封面时回退到专辑封面', () => {
    const track = mapTrack(fnTrackSchema.parse(rawTrack))
    expect(track.coverId).toBe('album_8f0738c1f8ff4f4f99c2a04d2a25d63d')
  })

  it('缺失 duration 时按 0 处理，避免播放器拿到 NaN', () => {
    const track = mapTrack(fnTrackSchema.parse({ ...rawTrack, duration: null }))
    expect(track.durationMs).toBe(0)
  })
})

describe('formatSort', () => {
  it('拼成 field,order', () => {
    expect(formatSort({ field: 'title', order: 'asc' }, 'track')).toBe('title,asc')
  })

  it('专辑列表把 createdAt 映射为 newTrackAddedAt', () => {
    expect(formatSort({ field: 'createdAt', order: 'desc' }, 'album')).toBe('newTrackAddedAt,desc')
  })

  it('收藏列表把 createdAt 映射为 favoriteAt', () => {
    expect(formatSort({ field: 'createdAt', order: 'desc' }, 'favoriteTrack')).toBe('favoriteAt,desc')
  })

  it('未提供排序时返回 undefined', () => {
    expect(formatSort(undefined, 'track')).toBeUndefined()
  })
})

describe('parseLyrics', () => {
  it('解析 LRC 时间轴并排序', () => {
    const sheet = parseLyrics('[00:12.34]第一行\n[00:05.00]更早的一行\n[ti:标题]')
    expect(sheet.synced).toBe(true)
    expect(sheet.lines.map((l) => l.text)).toEqual(['更早的一行', '第一行'])
    expect(sheet.lines[0]?.atMs).toBe(5000)
    expect(sheet.lines[1]?.atMs).toBe(12340)
  })

  it('纯文本歌词退化为不带时间轴', () => {
    const sheet = parseLyrics('第一行\n第二行')
    expect(sheet.synced).toBe(false)
    expect(sheet.lines).toHaveLength(2)
  })
})

describe('extractLyricText', () => {
  it('从多种候选字段里取正文', () => {
    expect(extractLyricText({ content: '[00:01.00]hi', source: 'cloud' })).toEqual({ text: '[00:01.00]hi', source: 'cloud' })
    expect(extractLyricText({ lyric: 'plain' })?.text).toBe('plain')
    expect(extractLyricText({ other: 1 })).toBeNull()
  })
})
