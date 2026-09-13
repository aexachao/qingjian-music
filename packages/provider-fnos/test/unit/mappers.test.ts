import { describe, expect, it } from 'vitest'
import { formatSort, mapLyricSheet, mapTrack, parseLyrics } from '../../src/mappers'
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

  it('增强型 LRC（行内逐词时间）解析出 words', () => {
    const sheet = parseLyrics('[00:10.00]我[00:11.50]爱[00:12.80]你')
    expect(sheet.synced).toBe(true)
    expect(sheet.lines).toHaveLength(1)
    const line = sheet.lines[0]!
    expect(line.text).toBe('我爱你')
    expect(line.words).toHaveLength(3)
    expect(line.words?.map((w) => w.text)).toEqual(['我', '爱', '你'])
    expect(line.words?.map((w) => w.atMs)).toEqual([10000, 11500, 12800])
  })

  it('只有整行一个时间的普通 LRC 不带 words', () => {
    const sheet = parseLyrics('[00:10.00]我爱你')
    expect(sheet.lines[0]?.words).toBeUndefined()
  })
})

describe('mapLyricSheet', () => {
  const entries = [
    { guid: 'ly-1', content: '[00:01.00]第一条', source: 3, isLRC: true, offset: 0 },
    { guid: 'ly-2', content: '[00:02.00]第二条', source: 1, isLRC: true, offset: 250 },
  ]

  it('优先取 preferred 指向的条目，并带回条目 id 与服务端偏移', () => {
    const sheet = mapLyricSheet(entries, 'ly-2')
    expect(sheet?.id).toBe('ly-2')
    expect(sheet?.offsetMs).toBe(250)
    expect(sheet?.lines[0]?.text).toBe('第二条')
    expect(sheet?.source).toBe('1')
  })

  it('preferred 缺失或指不到时退回第一条有正文的', () => {
    expect(mapLyricSheet(entries)?.id).toBe('ly-1')
    expect(mapLyricSheet(entries, '不存在的-guid')?.id).toBe('ly-1')
    expect(mapLyricSheet([{ guid: 'empty', content: '   ' }, entries[1]!])?.id).toBe('ly-2')
  })

  it('服务端 isLRC 覆盖解析结果，没有可用条目时返回 null', () => {
    expect(mapLyricSheet([{ guid: 'ly-3', content: '纯文本', isLRC: false }])?.synced).toBe(false)
    expect(mapLyricSheet([])).toBeNull()
    expect(mapLyricSheet([{ guid: 'ly-4', content: null }])).toBeNull()
  })

  // 实测 /lyric/list 会返回同一首歌的多个版本，且 preferred 不保证是质量最高的那个，
  // 所以选法必须是「按档位择优」，而不是「按 preferred 或数组顺序取」。
  it('多版本按档位择优：逐字优先于整行，不受数组顺序影响', () => {
    const mixed = [
      { guid: 'line-1', content: '[00:01.00]整行歌词', isLRC: true, offset: 0 },
      { guid: 'word-1', content: '[00:01.00]逐[00:01.50]字', isLRC: true, offset: 0 },
    ]
    const sheet = mapLyricSheet(mixed)
    expect(sheet?.id).toBe('word-1')
    expect(sheet?.tier).toBe('word')
    expect(sheet?.lines[0]?.words).toHaveLength(2)
    // 落选的版本作为备选带出去，供 UI 提供「切换歌词」
    expect(sheet?.alternates).toEqual([{ id: 'line-1', tier: 'line' }])
  })

  it('preferred 只在同档位内生效，不会把逐字降级成整行', () => {
    const mixed = [
      { guid: 'line-1', content: '[00:01.00]整行歌词', isLRC: true },
      { guid: 'word-1', content: '[00:01.00]逐[00:01.50]字', isLRC: true },
    ]
    expect(mapLyricSheet(mixed, 'line-1')?.id).toBe('word-1')
  })

  it('没有逐字版本时按「整行 > 纯文本」择优', () => {
    const mixed = [
      { guid: 'plain-1', content: '纯文本歌词', isLRC: false },
      { guid: 'line-1', content: '[00:01.00]整行歌词', isLRC: true },
    ]
    const sheet = mapLyricSheet(mixed)
    expect(sheet?.id).toBe('line-1')
    expect(sheet?.tier).toBe('line')
    expect(sheet?.alternates).toEqual([{ id: 'plain-1', tier: 'plain' }])
  })

  it('单版本时不产生 alternates', () => {
    expect(mapLyricSheet([{ guid: 'only', content: '[00:01.00]只有一份', isLRC: true }])?.alternates).toBeUndefined()
  })
})
