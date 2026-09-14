import { describe, expect, it } from 'vitest'
import { hasCode, hasNoCode } from '../support/source'

const screens = ['home.tsx', 'search.tsx', 'track-list-screen.tsx', 'album-detail.tsx', 'artist-detail.tsx']

describe('页面播放态 identity', () => {
  it('按 serverId + trackId 匹配，不再把 occurrence qid 当曲目 id', () => {
    for (const name of screens) {
      const path = `screens/${name}`
      expect(hasNoCode(path, 'playingQid'), path).toBe(true)
      expect(hasCode(path, 'current?.trackId'), path).toBe(true)
    }
  })
})
