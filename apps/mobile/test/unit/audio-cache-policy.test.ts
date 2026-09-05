import { describe, expect, it } from 'vitest'
import {
  type CacheEntry,
  cacheFileName,
  contentTypeFor,
  formatBytes,
  pickEvictions,
  safeExtension,
  totalBytes,
} from '../../src/player/audio-cache-policy'

describe('缓存文件名', () => {
  it('用服务器 id + 曲目 id + 真实后缀，非法字符会被替换', () => {
    expect(cacheFileName('srv-1', 'abc123', 'flac')).toBe('srv-1_abc123.flac')
    expect(cacheFileName('srv/1', 'a b', 'MP3')).toBe('srv_1_a_b.mp3')
  })

  it('格式缺失或异常时退回 audio 后缀', () => {
    expect(safeExtension(undefined)).toBe('audio')
    expect(safeExtension('')).toBe('audio')
    expect(safeExtension('toolongformat')).toBe('audio')
    expect(cacheFileName('s', 't')).toBe('s_t.audio')
  })

  it('已知格式给出 contentType，未知的不给', () => {
    expect(contentTypeFor('flac')).toBe('audio/flac')
    expect(contentTypeFor('mp3')).toBe('audio/mpeg')
    expect(contentTypeFor('ape')).toBeUndefined()
  })
})

describe('LRU 淘汰', () => {
  const entries: CacheEntry[] = [
    { key: 'a', size: 100, lastUsedAt: 1 },
    { key: 'b', size: 100, lastUsedAt: 2 },
    { key: 'c', size: 100, lastUsedAt: 3 },
  ]

  it('没超配额就不删任何东西', () => {
    expect(totalBytes(entries)).toBe(300)
    expect(pickEvictions(entries, 1_000, 100)).toEqual([])
  })

  it('超了就从最久未用的开始删，够了就停', () => {
    // 配额 300、已用 300，再进 100 就要腾出 100 => 只删最老的 a
    expect(pickEvictions(entries, 300, 100)).toEqual(['a'])
    // 要腾出 150 => a 不够，接着删 b
    expect(pickEvictions(entries, 300, 150)).toEqual(['a', 'b'])
    // 要腾出的比全部缓存还多时，全删（也只能全删）
    expect(pickEvictions(entries, 300, 400)).toEqual(['a', 'b', 'c'])
  })

  it('受保护的条目绝不删（正在播放/马上要播的那几首）', () => {
    expect(pickEvictions(entries, 300, 100, new Set(['a']))).toEqual(['b'])
    expect(pickEvictions(entries, 100, 100, new Set(['a', 'b', 'c']))).toEqual([])
  })
})

describe('体积展示', () => {
  it('按 GB / MB / KB 取整', () => {
    expect(formatBytes(0)).toBe('0 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
    expect(formatBytes(700 * 1024 ** 2)).toBe('700 MB')
    expect(formatBytes(2048)).toBe('2 KB')
  })
})
