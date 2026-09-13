import { describe, expect, it } from 'vitest'
import {
  LYRIC_TIER_ORDER,
  lyricCacheFileName,
  lyricCacheKey,
  parseLyricCacheFileName,
  pickLyricEvictions,
} from '../../src/lib/lyric-cache-policy'

describe('歌词缓存策略', () => {
  it('档位优先级为 逐字 > 整行 > 纯文本', () => {
    expect(LYRIC_TIER_ORDER).toEqual(['word', 'line', 'plain'])
  })

  it('缓存键由 服务器 + 曲目 + 档位 唯一确定', () => {
    expect(lyricCacheKey('srv-1', 'track-1', 'word')).toBe('srv-1__track-1__word')
    // 同一首歌的不同档位是不同键，才能分别缓存
    expect(lyricCacheKey('srv-1', 'track-1', 'word')).not.toBe(lyricCacheKey('srv-1', 'track-1', 'line'))
  })

  it('文件名与键一致并带 .json 后缀，非法字符被替换', () => {
    expect(lyricCacheFileName('srv-1', 'track-1', 'line')).toBe('srv-1__track-1__line.json')
    expect(lyricCacheFileName('a/b:c', 'd e', 'plain')).toBe('a_b_c__d_e__plain.json')
  })

  it('能从文件名还原键与档位', () => {
    const name = lyricCacheFileName('srv-1', 'track-1', 'word')
    expect(parseLyricCacheFileName(name)).toEqual({ key: 'srv-1__track-1__word', tier: 'word' })
  })

  it('索引文件与非歌词文件不会被当成歌词缓存', () => {
    expect(parseLyricCacheFileName('index.json')).toBeNull()
    expect(parseLyricCacheFileName('srv-1__track-1__unknown.json')).toBeNull()
    expect(parseLyricCacheFileName('srv-1__track-1__word.lrc')).toBeNull()
  })

  it('未超上限时不淘汰', () => {
    const entries = [
      { key: 'a', lastUsedAt: 1 },
      { key: 'b', lastUsedAt: 2 },
    ]
    expect(pickLyricEvictions(entries, 5)).toEqual([])
    expect(pickLyricEvictions(entries, 2)).toEqual([])
  })

  it('超上限时按最久未用先删', () => {
    const entries = [
      { key: 'oldest', lastUsedAt: 10 },
      { key: 'newest', lastUsedAt: 30 },
      { key: 'middle', lastUsedAt: 20 },
    ]
    expect(pickLyricEvictions(entries, 2)).toEqual(['oldest'])
    expect(pickLyricEvictions(entries, 1)).toEqual(['oldest', 'middle'])
  })

  it('上限为 0 表示不限制', () => {
    expect(pickLyricEvictions([{ key: 'a', lastUsedAt: 1 }], 0)).toEqual([])
  })
})
