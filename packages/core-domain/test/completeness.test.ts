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
  it('去括号/标点/空白、转小写', () => {
    expect(normalizeName('晴天 (Live)')).toBe('晴天')
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
  it('标出已入库与缺失,数量正确', () => {
    const local = [track('a', '新阿瓦尔古丽'), track('b', '冲动的惩罚 (Live)')]
    const r = computeAlbumCompleteness(local, canonical)
    expect(r.total).toBe(4)
    expect(r.owned).toBe(2) // 新阿瓦尔古丽 + 冲动的惩罚(去 Live 后命中)
    expect(r.missing).toBe(2)
    expect(r.entries.find((e) => e.canonical.title === '情人')!.status).toBe('missing')
    expect(r.entries.find((e) => e.canonical.title === '新阿瓦尔古丽')!.status).toBe('inLibrary')
  })
  it('本地有、规范没有的算 extraLocal', () => {
    const local = [track('a', '新阿瓦尔古丽'), track('x', '某未收录曲')]
    const r = computeAlbumCompleteness(local, canonical)
    expect(r.extraLocal.map((t) => t.id)).toEqual(['x'])
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
