import { describe, expect, it } from 'vitest'
import type { Track } from '@qj/core-domain'
import { pickFeaturedTracks } from '../../src/lib/track-select'

function track(id: string, favorite = false): Track {
  return { id, title: id, durationMs: 1000, artists: [], genres: [], isCue: false, isFavorite: favorite }
}

describe('pickFeaturedTracks', () => {
  it('收藏优先，再按原顺序补齐', () => {
    const local = [track('a'), track('b', true), track('c'), track('d', true)]
    const result = pickFeaturedTracks(local, 3)
    expect(result.map((t) => t.id)).toEqual(['b', 'd', 'a'])
  })

  it('不超过 maxCount', () => {
    const local = [track('a'), track('b'), track('c')]
    expect(pickFeaturedTracks(local, 2)).toHaveLength(2)
  })

  it('空输入返回空', () => {
    expect(pickFeaturedTracks([], 5)).toEqual([])
  })

  it('不重复', () => {
    const local = [track('a', true), track('b')]
    const result = pickFeaturedTracks(local, 10)
    expect(new Set(result.map((t) => t.id)).size).toBe(result.length)
  })
})
