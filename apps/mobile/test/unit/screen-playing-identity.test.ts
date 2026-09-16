import { describe, expect, it } from 'vitest'
import { hasCode, hasNoCode } from '../support/source'

// 搜索结果的曲目列表现在由 TrackListScreen 渲染（第 9 轮把 /search/{tracks,…} 四个二级页
// 并进了结果页签），所以这里不再单独列 search.tsx —— 那条路径已由 track-list-screen.tsx 覆盖。
// 艺术家详情页第 6 轮起把曲目列表交给 TrackListScreen（两个页签：专辑网格 / 歌曲列表），
// 所以它自己不再渲染 TrackRow —— 那条路径已由 track-list-screen.tsx 覆盖。
const screens = ['home.tsx', 'track-list-screen.tsx', 'album-detail.tsx', 'playlist-detail.tsx', 'genre-detail.tsx', 'favorites.tsx']

describe('页面播放态 identity', () => {
  it('按 serverId + trackId 匹配，不再把 occurrence qid 当曲目 id', () => {
    for (const name of screens) {
      const path = `screens/${name}`
      expect(hasNoCode(path, 'playingQid'), path).toBe(true)
      expect(hasCode(path, 'current?.trackId'), path).toBe(true)
    }
  })
})
