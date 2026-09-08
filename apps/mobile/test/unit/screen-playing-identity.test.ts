import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const screens = ['home.tsx', 'search.tsx', 'track-list-screen.tsx', 'album-detail.tsx', 'artist-detail.tsx']

describe('页面播放态 identity', () => {
  it('按 serverId + trackId 匹配，不再把 occurrence qid 当曲目 id', () => {
    for (const name of screens) {
      const source = readFileSync(resolve(__dirname, `../../src/screens/${name}`), 'utf8')
      expect(source).not.toContain('playingQid')
      expect(source).toContain('current?.trackId')
    }
  })
})
