import { describe, expect, it } from 'vitest'
import type { QueueItem } from '@qj/core-domain'
import { createPlaybackSnapshot, parsePlaybackSnapshot } from '../../src/player/snapshot'

function queueItem(id: string): QueueItem {
  return {
    qid: `server-a:${id}`,
    serverId: 'server-a',
    trackId: id,
    title: `曲目 ${id}`,
    artistText: '测试艺术家',
    durationMs: 180_000,
    coverId: `cover-${id}`,
    artwork: {
      url: `http://nas.local/cover/${id}`,
      headers: { authorization: 'secret-token' },
    },
  }
}

describe('播放快照安全边界', () => {
  it('序列化时移除队列和原始队列里的鉴权资源', () => {
    const item = queueItem('track-1')
    const snapshot = createPlaybackSnapshot({
      serverId: 'server-a',
      queue: [item],
      history: [item],
      baseQueue: [item],
      index: 0,
      position: 12.5,
      playMode: { repeat: 'off', shuffle: false },
      autoplay: false,
      source: { kind: 'tracks', label: '全部歌曲' },
      lyricOffsetMs: 0,
      savedAt: 1,
    })

    const serialized = JSON.stringify(snapshot).toLowerCase()
    expect(serialized).not.toContain('authorization')
    expect(serialized).not.toContain('secret-token')
    expect(snapshot.queue[0]?.coverId).toBe('cover-track-1')
    expect(snapshot.queue[0]).not.toHaveProperty('artwork')
    expect(snapshot.history[0]).not.toHaveProperty('artwork')
    expect(snapshot.baseQueue[0]).not.toHaveProperty('artwork')
  })

  it('拒绝旧版快照，避免恢复其中已经落盘的凭证', () => {
    const legacy = {
      version: 1,
      serverId: 'server-a',
      queue: [queueItem('track-1')],
      baseQueue: [queueItem('track-1')],
      index: 0,
      position: 0,
      playMode: { repeat: 'off', shuffle: false },
      autoplay: false,
      lyricOffsetMs: 0,
      savedAt: 1,
    }

    expect(parsePlaybackSnapshot(legacy)).toBeNull()
  })

  it('历史不去重：同一首多次出现全保留（对齐收听流模型）', () => {
    const item = queueItem('track-1')
    const parsed = parsePlaybackSnapshot({
      version: 3,
      serverId: 'server-a',
      queue: [item],
      history: [item, { ...item }],
      baseQueue: [item],
      index: 0,
      position: 0,
      playMode: { repeat: 'off', shuffle: false },
      autoplay: false,
      lyricOffsetMs: 0,
      savedAt: 1,
    })

    // 两条都在（不再按 qid 去重）
    expect(parsed?.history).toHaveLength(2)
  })

  it('历史超软上限（200）时只留最近的，从最旧的截', () => {
    const item = queueItem('track-1')
    // 造 250 条历史，每条带不同 qid 侜辨顺序
    const history = Array.from({ length: 250 }, (_, i) => ({ ...item, qid: `h-${i}` }))
    const parsed = parsePlaybackSnapshot({
      version: 3,
      serverId: 'server-a',
      queue: [item],
      history,
      baseQueue: [item],
      index: 0,
      position: 0,
      playMode: { repeat: 'off', shuffle: false },
      autoplay: false,
      lyricOffsetMs: 0,
      savedAt: 1,
    })

    expect(parsed?.history).toHaveLength(200)
    // 留的是最近的 200 条（h-50 … h-249）
    expect(parsed?.history[0]?.qid).toBe('h-50')
    expect(parsed?.history[199]?.qid).toBe('h-249')
  })

  it('读取时再次剥离未知来源注入的 artwork 并修正数值边界', () => {
    const item = queueItem('track-1')
    const parsed = parsePlaybackSnapshot({
      version: 3,
      serverId: 'server-a',
      queue: [item],
      baseQueue: [item],
      index: 99,
      position: Number.NaN,
      playMode: { repeat: 'queue', shuffle: true },
      autoplay: true,
      lyricOffsetMs: Number.POSITIVE_INFINITY,
      savedAt: 1,
    })

    expect(parsed?.index).toBe(0)
    expect(parsed?.position).toBe(0)
    expect(parsed?.lyricOffsetMs).toBe(0)
    expect(parsed?.queue[0]).not.toHaveProperty('artwork')
  })
})
