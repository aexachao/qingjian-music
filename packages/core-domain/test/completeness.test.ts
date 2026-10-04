import { describe, expect, it } from 'vitest'
import {
  computeAlbumCompleteness,
  computeArtistCompleteness,
  inferTrackGaps,
  normalizeName,
  type Album,
  type CanonicalAlbum,
  type CanonicalTrack,
  type Track,
} from '../src/index'

function track(id: string, title: string, trackNo?: number): Track {
  return { id, title, durationMs: 1000, artists: [], genres: [], isCue: false, ...(trackNo ? { trackNo } : {}) }
}
function album(id: string, name: string, year?: number): Album {
  return { id, name, artists: [], ...(year ? { releaseDate: `${year}-01-01` } : {}) }
}

describe('normalizeName', () => {
  it('去标点/空白、转小写并保留括号里的版本词', () => {
    expect(normalizeName('晴天 (Live)')).toBe('晴天live')
    expect(normalizeName('Mojito · 莫吉托')).toBe('mojito莫吉托')
  })
})

describe('computeAlbumCompleteness', () => {
  const canonical: CanonicalTrack[] = [
    { title: '2002年的第一场雪', trackNo: 1 },
    { title: '新阿瓦尔古丽', trackNo: 2 },
    { title: '情人', trackNo: 6 },
    { title: '冲动的惩罚', trackNo: 12 },
  ]
  it('不会把现场版曲目误认为普通版本', () => {
    const local = [track('a', '新阿瓦尔古丽'), track('b', '冲动的惩罚 (Live)')]
    const r = computeAlbumCompleteness(local, canonical)
    expect(r.total).toBe(4)
    expect(r.owned).toBe(1)
    expect(r.missing).toBe(3)
    expect(r.entries.find((e) => e.canonical.title === '情人')!.status).toBe('missing')
    expect(r.entries.find((e) => e.canonical.title === '新阿瓦尔古丽')!.status).toBe('inLibrary')
  })
  it('本地有、规范没有的算 extraLocal', () => {
    const local = [track('a', '新阿瓦尔古丽'), track('x', '某未收录曲')]
    const r = computeAlbumCompleteness(local, canonical)
    expect(r.extraLocal.map((t) => t.id)).toEqual(['x'])
  })
  it('多张同名本地曲目无法唯一归属时单独标为待核对', () => {
    const local = [track('a', '重复曲目'), track('b', '重复曲目')]
    const r = computeAlbumCompleteness(local, [{ title: '重复曲目' }])
    expect(r.entries[0]?.status).toBe('ambiguous')
    expect(r.owned).toBe(0)
    expect(r.missing).toBe(0)
    expect(r.ambiguous).toBe(1)
    expect(r.extraLocal).toHaveLength(0)
    expect(r.ambiguousLocal.map((item) => item.id)).toEqual(['a', 'b'])
  })
  it('相同曲名可由碟号消歧', () => {
    const local = [
      { ...track('disc-1', '序曲', 1), discNo: 1 },
      { ...track('disc-2', '序曲', 1), discNo: 2 },
    ]
    const r = computeAlbumCompleteness(local, [
      { title: '序曲', trackNo: 1, discNo: 1 },
      { title: '序曲', trackNo: 1, discNo: 2 },
    ])
    expect(r.owned).toBe(2)
    expect(r.ambiguous).toBe(0)
  })
  it('相同曲名但碟号冲突时标为待核对，不报已拥有或缺失', () => {
    const local = [{ ...track('disc-2', '序曲', 1), discNo: 2 }]
    const r = computeAlbumCompleteness(local, [{ title: '序曲', trackNo: 1, discNo: 1 }])
    expect(r.entries[0]?.status).toBe('ambiguous')
    expect(r.owned).toBe(0)
    expect(r.missing).toBe(0)
    expect(r.ambiguous).toBe(1)
    expect(r.ambiguousLocal.map((item) => item.id)).toEqual(['disc-2'])
  })
  it('重复规范条目不会把唯一的本地曲目分给其中一个', () => {
    const r = computeAlbumCompleteness([track('a', '重复曲目')], [{ title: '重复曲目' }, { title: '重复曲目' }])
    expect(r.entries.map((entry) => entry.status)).toEqual(['ambiguous', 'ambiguous'])
    expect(r.owned).toBe(0)
    expect(r.missing).toBe(0)
    expect(r.ambiguousLocal.map((item) => item.id)).toEqual(['a'])
  })
  it('规范为空 → 全 extraLocal、total 0', () => {
    const r = computeAlbumCompleteness([track('a', 'x')], [])
    expect(r.total).toBe(0)
    expect(r.extraLocal).toHaveLength(1)
  })
})

describe('computeArtistCompleteness', () => {
  const canonical: CanonicalAlbum[] = [
    { name: '2002年的第一场雪', year: 2004 },
    { name: '刀郎Ⅲ' },
    { name: '披着羊皮的狼' },
  ]
  it('标出已入库/未入库专辑', () => {
    const local = [album('1', '2002年的第一场雪', 2004)]
    const r = computeArtistCompleteness(local, canonical)
    expect(r.owned).toBe(1)
    expect(r.missing).toBe(2)
    expect(r.entries.find((e) => e.canonical.name === '刀郎Ⅲ')!.status).toBe('missing')
  })
  it('忽略通用录音室版标签，但保留真实版本差异', () => {
    const local = [album('studio', '专辑'), album('deluxe', '精选集 Deluxe'), album('live', '精选集 Live')]
    const r = computeArtistCompleteness(local, [
      { name: '专辑', edition: '专辑 · 录音室版' },
      { name: '精选集', edition: 'Deluxe' },
      { name: '精选集 (Live)', edition: 'Live' },
    ])
    expect(r.entries.map((entry) => entry.status)).toEqual(['inLibrary', 'inLibrary', 'inLibrary'])
    expect(r.owned).toBe(3)
  })
  it('多个同名同年艺人专辑候选不会伪报已拥有或缺失', () => {
    const local = [album('a', '精选集', 2004), album('b', '精选集', 2004)]
    local.forEach((item) => { item.artists = [{ id: 'artist-1', name: '歌手' }] })
    const r = computeArtistCompleteness(local, [{ name: '精选集', year: 2004, artistName: '歌手' }])
    expect(r.entries[0]?.status).toBe('ambiguous')
    expect(r.owned).toBe(0)
    expect(r.missing).toBe(0)
    expect(r.ambiguous).toBe(1)
    expect(r.extraLocal).toHaveLength(0)
    expect(r.ambiguousLocal.map((item) => item.id)).toEqual(['a', 'b'])
  })
  it('同名专辑的明确艺人冲突不会被当作本地匹配', () => {
    const local = [album('other-artist', '精选集', 2004)]
    local[0]!.artists = [{ id: 'other', name: '另一位歌手' }]
    const r = computeArtistCompleteness(local, [{ name: '精选集', year: 2004, artistName: '歌手' }])
    expect(r.entries[0]?.status).toBe('missing')
    expect(r.owned).toBe(0)
    expect(r.missing).toBe(1)
    expect(r.extraLocal.map((item) => item.id)).toEqual(['other-artist'])
  })
})

describe('inferTrackGaps（零依赖缺口）', () => {
  it('从本地曲目号推断缺号', () => {
    const local = [track('a', 'a', 2), track('b', 'b', 3), track('c', 'c', 4), track('d', 'd', 6), track('e', 'e', 12)]
    expect(inferTrackGaps(local)).toEqual([1, 5, 7, 8, 9, 10, 11])
  })
  it('无曲目号返回空', () => {
    expect(inferTrackGaps([track('a', 'a')])).toEqual([])
  })
})
