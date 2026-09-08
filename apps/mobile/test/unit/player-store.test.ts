import { beforeEach, describe, expect, it } from 'vitest'
import type { QueueItem } from '@qj/core-domain'
import { selectCurrent, usePlayerStore } from '../../src/player/store'

function item(id: string, occurrence = id): QueueItem {
  return {
    qid: `srv:${id}:${occurrence}`,
    serverId: 'srv',
    trackId: id,
    title: `曲目 ${id}`,
    artistText: '测试艺术家',
    durationMs: 180_000,
  }
}

const queue = ['a', 'b', 'c', 'd'].map((id) => item(id))

beforeEach(() => {
  usePlayerStore.getState().clear()
})

describe('独立当前、待播和历史语义', () => {
  it('新播放列表把选中歌曲放在当前，其余歌曲保持原顺序待播', () => {
    const ordered = [queue[2]!, queue[0]!, queue[1]!, queue[3]!]
    usePlayerStore.getState().setQueue(ordered, 0, { kind: 'tracks', label: '全部歌曲' })

    const state = usePlayerStore.getState()
    expect(selectCurrent(state)?.trackId).toBe('c')
    expect(state.queue.slice(1).map((entry) => entry.trackId)).toEqual(['a', 'b', 'd'])
    expect(state.history).toEqual([])
  })

  it('点击待播中间歌曲只取出该项，其他待播不动，旧当前追加历史', () => {
    usePlayerStore.getState().setQueue(queue, 0, { kind: 'tracks', label: '全部歌曲' })

    usePlayerStore.getState().activateIndex(2)

    const state = usePlayerStore.getState()
    expect(state.queue.map((entry) => entry.trackId)).toEqual(['c', 'b', 'd'])
    expect(state.history.map((entry) => entry.trackId)).toEqual(['a'])
    expect(state.index).toBe(0)
  })

  it('自然或手动切到下一首时旧当前只追加一次', () => {
    usePlayerStore.getState().setQueue(queue, 0, { kind: 'tracks', label: '全部歌曲' })

    usePlayerStore.getState().activateIndex(1)
    usePlayerStore.getState().activateIndex(0)

    const state = usePlayerStore.getState()
    expect(state.history.map((entry) => entry.trackId)).toEqual(['a'])
    expect(selectCurrent(state)?.trackId).toBe('b')
  })

  it('从历史点播不修改历史和待播，并给当前创建新 occurrence', () => {
    usePlayerStore.getState().setQueue(queue, 0, { kind: 'tracks', label: '全部歌曲' })
    usePlayerStore.getState().activateIndex(1)
    const historicA = usePlayerStore.getState().history[0]!
    const upcomingBefore = usePlayerStore.getState().queue.slice(1).map((entry) => entry.qid)

    usePlayerStore.getState().activateHistoryItem(historicA, 'srv:a:replay')

    const state = usePlayerStore.getState()
    expect(state.queue[0]?.qid).toBe('srv:a:replay')
    expect(state.queue.slice(1).map((entry) => entry.qid)).toEqual(upcomingBefore)
    expect(state.history.map((entry) => entry.trackId)).toEqual(['a', 'b'])
  })

  it('同一首歌多次离开当前会在历史中重复追加', () => {
    usePlayerStore.getState().setQueue([item('a', 'first'), item('b'), item('a', 'second')], 0)
    usePlayerStore.getState().activateIndex(1)
    usePlayerStore.getState().activateIndex(1)

    expect(usePlayerStore.getState().history.map((entry) => entry.trackId)).toEqual(['a', 'b'])
    usePlayerStore.getState().activateHistoryItem(item('a', 'history'), 'srv:a:replay')
    usePlayerStore.getState().activateIndex(1)
    expect(usePlayerStore.getState().history.map((entry) => entry.trackId)).toEqual(['a', 'b', 'a'])
  })

  it('同一 occurrence 即使收到重复切歌事件也只进入历史一次', () => {
    usePlayerStore.getState().setQueue([item('a', 'current'), item('b')], 0)
    usePlayerStore.getState().activateIndex(1)
    const historicA = usePlayerStore.getState().history[0]!

    // 模拟旧版计数器重启后错误复用了历史里的 qid。
    usePlayerStore.getState().activateHistoryItem(historicA, historicA.qid)
    usePlayerStore.getState().activateIndex(1)

    const historyIds = usePlayerStore.getState().history.map((entry) => entry.qid)
    expect(new Set(historyIds).size).toBe(historyIds.length)
  })

  it('清历史只清日志，不影响当前和待播', () => {
    usePlayerStore.getState().setQueue(queue, 0)
    usePlayerStore.getState().activateIndex(1)
    const queueBefore = usePlayerStore.getState().queue

    usePlayerStore.getState().clearHistory()

    expect(usePlayerStore.getState().history).toEqual([])
    expect(usePlayerStore.getState().queue).toEqual(queueBefore)
  })
})

describe('待播排序和删除', () => {
  it('排序待播不会改变当前项', () => {
    usePlayerStore.getState().setQueue(queue, 0)
    usePlayerStore.getState().moveItem(3, 1)
    expect(usePlayerStore.getState().queue.map((entry) => entry.trackId)).toEqual(['a', 'd', 'b', 'c'])
    expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('a')
  })

  it('删除重复曲目的一个 occurrence 不影响另一个', () => {
    usePlayerStore.getState().setQueue([item('a', 'current'), item('a', 'first'), item('a', 'second')], 0)
    usePlayerStore.getState().removeItem(1)
    expect(usePlayerStore.getState().queue.map((entry) => entry.qid)).toEqual(['srv:a:current', 'srv:a:second'])
  })
})

describe('收藏、恢复和设置', () => {
  it('收藏状态同步到队列、历史和原始顺序中的同曲目 occurrence', () => {
    usePlayerStore.getState().setQueue([item('a', 'first'), item('b'), item('a', 'second')], 0)
    usePlayerStore.getState().activateIndex(1)
    usePlayerStore.getState().patchItem('a', { isFavorite: true })
    const state = usePlayerStore.getState()
    expect(state.queue.filter((entry) => entry.trackId === 'a').every((entry) => entry.isFavorite)).toBe(true)
    expect(state.history.filter((entry) => entry.trackId === 'a').every((entry) => entry.isFavorite)).toBe(true)
  })

  it('旧结构恢复时把当前之前迁移为历史并把当前固定到队首', () => {
    usePlayerStore.getState().restore({
      queue,
      baseQueue: queue,
      index: 2,
      playMode: { repeat: 'off', shuffle: false },
      autoplay: false,
      lyricOffsetMs: 0,
    })
    const state = usePlayerStore.getState()
    expect(state.history.map((entry) => entry.trackId)).toEqual(['a', 'b'])
    expect(state.queue.map((entry) => entry.trackId)).toEqual(['c', 'd'])
    expect(state.index).toBe(0)
  })

  it('无限播放默认关闭，可以单独打开', () => {
    expect(usePlayerStore.getState().autoplay).toBe(false)
    usePlayerStore.getState().setAutoplay(true)
    expect(usePlayerStore.getState().autoplay).toBe(true)
  })

  it('清空后所有播放区域和来源一起复位', () => {
    usePlayerStore.getState().setQueue(queue, 0, { kind: 'album', id: 'al-1', label: '专辑 · 测试' })
    usePlayerStore.getState().activateIndex(1)
    usePlayerStore.getState().clear()
    const state = usePlayerStore.getState()
    expect(state.queue).toEqual([])
    expect(state.history).toEqual([])
    expect(state.index).toBe(-1)
    expect(state.source).toBeUndefined()
  })
})
