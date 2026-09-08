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

  it('读取时移除旧版本故障留下的重复 occurrence', () => {
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

    expect(parsed?.history.map((entry) => entry.qid)).toEqual([item.qid])
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
