import { beforeEach, describe, expect, it } from 'vitest'
import type { QueueItem } from '@qj/core-domain'
import { selectCurrent, usePlayerStore } from '../../src/player/store'

function item(id: string): QueueItem {
  return {
    qid: `srv:${id}`,
    serverId: 'srv',
    trackId: id,
    title: `曲目 ${id}`,
    artistText: '测试艺术家',
    durationMs: 180_000,
  }
}

const queue = ['a', 'b', 'c', 'd'].map(item)

beforeEach(() => {
  usePlayerStore.getState().clear()
})

describe('队列排序', () => {
  it('把靠后的曲目拖到当前播放之前时，当前下标跟着后移', () => {
    const store = usePlayerStore.getState()
    store.setQueue(queue, 1, { kind: 'album', id: 'al-1', label: '专辑 · 测试' })

    // d 拖到最前面：当前播放的 b 从 1 变成 2
    usePlayerStore.getState().moveItem(3, 0)

    const state = usePlayerStore.getState()
    expect(state.queue.map((entry) => entry.trackId)).toEqual(['d', 'a', 'b', 'c'])
    expect(state.index).toBe(2)
    expect(selectCurrent(state)?.trackId).toBe('b')
  })

  it('把当前播放的曲目自己拖走，下标跟着它走', () => {
    usePlayerStore.getState().setQueue(queue, 0, { kind: 'tracks', label: '全部歌曲' })

    usePlayerStore.getState().moveItem(0, 2)

    const state = usePlayerStore.getState()
    expect(state.queue.map((entry) => entry.trackId)).toEqual(['b', 'c', 'a', 'd'])
    expect(state.index).toBe(2)
    expect(selectCurrent(state)?.trackId).toBe('a')
  })

  it('from 等于 to 时原样返回', () => {
    usePlayerStore.getState().setQueue(queue, 2, { kind: 'tracks', label: '全部歌曲' })
    usePlayerStore.getState().moveItem(2, 2)
    expect(usePlayerStore.getState().queue.map((entry) => entry.trackId)).toEqual(['a', 'b', 'c', 'd'])
    expect(usePlayerStore.getState().index).toBe(2)
  })
})

describe('队列删除', () => {
  it('删掉当前播放之前的曲目，下标左移', () => {
    usePlayerStore.getState().setQueue(queue, 2, { kind: 'tracks', label: '全部歌曲' })

    usePlayerStore.getState().removeItem(0)

    const state = usePlayerStore.getState()
    expect(state.queue.map((entry) => entry.trackId)).toEqual(['b', 'c', 'd'])
    expect(state.index).toBe(1)
    expect(selectCurrent(state)?.trackId).toBe('c')
  })

  it('删掉当前播放之后的曲目，下标不变', () => {
    usePlayerStore.getState().setQueue(queue, 1, { kind: 'tracks', label: '全部歌曲' })

    usePlayerStore.getState().removeItem(3)

    const state = usePlayerStore.getState()
    expect(state.queue.map((entry) => entry.trackId)).toEqual(['a', 'b', 'c'])
    expect(state.index).toBe(1)
  })

  it('删到只剩一首时下标不会越界', () => {
    usePlayerStore.getState().setQueue(queue.slice(0, 2), 1, { kind: 'tracks', label: '全部歌曲' })

    usePlayerStore.getState().removeItem(1)

    expect(usePlayerStore.getState().index).toBe(0)
  })
})

describe('收藏状态', () => {
  it('patchItem 只改命中的那一首', () => {
    usePlayerStore.getState().setQueue(queue, 0, { kind: 'tracks', label: '全部歌曲' })

    usePlayerStore.getState().patchItem('srv:c', { isFavorite: true })

    const state = usePlayerStore.getState()
    expect(state.queue.find((entry) => entry.trackId === 'c')?.isFavorite).toBe(true)
    expect(state.queue.find((entry) => entry.trackId === 'a')?.isFavorite).toBeUndefined()
  })
})

describe('清空', () => {
  it('清空后来源与下标一起复位', () => {
    usePlayerStore.getState().setQueue(queue, 3, { kind: 'album', id: 'al-1', label: '专辑 · 测试' })

    usePlayerStore.getState().clear()

    const state = usePlayerStore.getState()
    expect(state.queue).toEqual([])
    expect(state.index).toBe(-1)
    expect(state.source).toBeUndefined()
    expect(selectCurrent(state)).toBeUndefined()
  })
})
