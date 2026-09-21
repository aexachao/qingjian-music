import { describe, expect, it } from 'vitest'
import type { QueueItem } from '@qj/core-domain'
import {
  HISTORY_VIEW_CAP,
  queueAxisRows,
  queueAxisView,
} from '../../src/lib/queue-axis-policy'

function item(id: string, qid = id): QueueItem {
  return {
    qid,
    serverId: 'srv',
    trackId: id,
    title: id,
    artistText: 'a',
    durationMs: 1000,
  }
}

describe('queueAxisView', () => {
  it('拆成 历史 / 正在播放 / 待播 三段', () => {
    const queue = [item('a'), item('b'), item('c'), item('d')]
    const history = [item('x'), item('y')]
    const view = queueAxisView(history, queue, 1)

    expect(view.current?.trackId).toBe('b')
    expect(view.upcoming.map((e) => e.trackId)).toEqual(['c', 'd'])
    expect(view.history.map((e) => e.trackId)).toEqual(['x', 'y'])
    expect(view.historyTruncated).toBe(false)
  })

  it('index < 0（还没开始）→ 无当前，整个队列是待播', () => {
    const queue = [item('a'), item('b')]
    const view = queueAxisView([], queue, -1)
    expect(view.current).toBeUndefined()
    expect(view.upcoming.map((e) => e.trackId)).toEqual(['a', 'b'])
  })

  it('历史超过显示上限 → 只留最近 HISTORY_VIEW_CAP 条（保持正序，末尾=最近）', () => {
    const history = Array.from({ length: HISTORY_VIEW_CAP + 20 }, (_, i) => item(`t${i}`, `q${i}`))
    const view = queueAxisView(history, [item('cur')], 0)

    expect(view.history).toHaveLength(HISTORY_VIEW_CAP)
    expect(view.historyTruncated).toBe(true)
    // 留的是最近的：末尾是原始最后一条（最近），头部是被截断后的第一条
    expect(view.history[view.history.length - 1]?.trackId).toBe(`t${HISTORY_VIEW_CAP + 19}`)
    expect(view.history[0]?.trackId).toBe('t20')
  })

  it('历史正好等于上限 → 不截断', () => {
    const history = Array.from({ length: HISTORY_VIEW_CAP }, (_, i) => item(`t${i}`, `q${i}`))
    const view = queueAxisView(history, [item('cur')], 0)
    expect(view.history).toHaveLength(HISTORY_VIEW_CAP)
    expect(view.historyTruncated).toBe(false)
  })
})

describe('queueAxisRows', () => {
  it('历史/待播各成行，queueIndex 对齐 store.queue 的真实下标', () => {
    const queue = [item('a'), item('b'), item('c'), item('d')]
    const view = queueAxisView([item('x')], queue, 1)
    const { historyRows, upcomingRows } = queueAxisRows(view, 1)

    expect(historyRows.map((r) => r.kind)).toEqual(['history'])
    // 当前在 index 1，待播是 c(2)、d(3)
    expect(upcomingRows).toEqual([
      expect.objectContaining({ kind: 'upcoming', queueIndex: 2 }),
      expect.objectContaining({ kind: 'upcoming', queueIndex: 3 }),
    ])
  })

  it('历史为空 → 一条 historyEmpty 占位', () => {
    const view = queueAxisView([], [item('a')], 0)
    const { historyRows } = queueAxisRows(view, 0)
    expect(historyRows).toEqual([{ kind: 'historyEmpty', key: 'history_empty' }])
  })

  it('待播为空 → 一条 upcomingEmpty 占位', () => {
    const view = queueAxisView([], [item('a')], 0)
    const { upcomingRows } = queueAxisRows(view, 0)
    expect(upcomingRows).toEqual([{ kind: 'upcomingEmpty', key: 'upcoming_empty' }])
  })
})
