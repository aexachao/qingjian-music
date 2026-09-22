import { describe, expect, it } from 'vitest'
import type { QueueItem } from '@qj/core-domain'
import { HISTORY_VIEW_CAP, axisSnapOffsets, queueAxisView } from '../../src/lib/queue-axis-policy'

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

describe('queueAxisView（三模块 SectionList）', () => {
  it('有历史+当前+待播 → 三个 section，顺序 历史/正在播放/待播', () => {
    const queue = [item('a'), item('b'), item('c'), item('d')]
    const view = queueAxisView([item('x'), item('y')], queue, 1)

    expect(view.sections.map((s) => s.key)).toEqual(['history', 'current', 'upcoming'])
    expect(view.currentSectionIndex).toBe(1)
    // 历史保持正序：最近(y)在末尾，贴着正在播放
    expect(view.sections[0]!.data.map((r) => r.kind)).toEqual(['history', 'history'])
    expect((view.sections[0]!.data[1] as { item: QueueItem }).item.trackId).toBe('y')
    // 待播 = c, d，queueIndex 对齐 store.queue 真实下标
    expect(view.sections[2]!.data).toEqual([
      expect.objectContaining({ kind: 'upcoming', queueIndex: 2 }),
      expect.objectContaining({ kind: 'upcoming', queueIndex: 3 }),
    ])
  })

  it('无历史 → 只有 正在播放/待播 两个 section', () => {
    const view = queueAxisView([], [item('a'), item('b')], 0)
    expect(view.sections.map((s) => s.key)).toEqual(['current', 'upcoming'])
    expect(view.currentSectionIndex).toBe(0)
  })

  it('index < 0（还没开始）→ 无当前，无历史，整个队列是待播', () => {
    const view = queueAxisView([item('x')], [item('a'), item('b')], -1)
    expect(view.sections.map((s) => s.key)).toEqual(['upcoming'])
    expect(view.currentSectionIndex).toBe(-1)
    expect(view.sections[0]!.data).toHaveLength(2)
  })

  it('待播为空 → 一条 upcomingEmpty 占位', () => {
    const view = queueAxisView([], [item('a')], 0)
    const upcoming = view.sections.find((s) => s.key === 'upcoming')!
    expect(upcoming.data).toEqual([{ kind: 'upcomingEmpty', key: 'upcoming_empty' }])
  })

  it('历史超过显示上限 → 只留最近 HISTORY_VIEW_CAP 条，末尾=最近', () => {
    const history = Array.from({ length: HISTORY_VIEW_CAP + 20 }, (_, i) => item(`t${i}`, `q${i}`))
    const view = queueAxisView(history, [item('cur')], 0)
    const hist = view.sections.find((s) => s.key === 'history')!
    expect(hist.data).toHaveLength(HISTORY_VIEW_CAP)
    expect(view.historyTruncated).toBe(true)
    expect((hist.data[hist.data.length - 1] as { item: QueueItem }).item.trackId).toBe(`t${HISTORY_VIEW_CAP + 19}`)
    expect((hist.data[0] as { item: QueueItem }).item.trackId).toBe('t20')
  })

  it('历史正好等于上限 → 不截断', () => {
    const history = Array.from({ length: HISTORY_VIEW_CAP }, (_, i) => item(`t${i}`, `q${i}`))
    const view = queueAxisView(history, [item('cur')], 0)
    expect(view.historyCount).toBe(HISTORY_VIEW_CAP)
    expect(view.historyTruncated).toBe(false)
  })
})

describe('axisSnapOffsets（方案甲：历史↔正在播放两个吸附点）', () => {
  it('有历史时：[0, 历史头高 + 历史行总高]', () => {
    const history = [item('x'), item('y'), item('z')]
    const view = queueAxisView(history, [item('a'), item('b')], 0)
    // 40 + 3*56 = 208
    expect(axisSnapOffsets(view)).toEqual([0, 208])
  })

  it('无历史时：空数组（正在播放本就在顶）', () => {
    const view = queueAxisView([], [item('a'), item('b')], 0)
    expect(axisSnapOffsets(view)).toEqual([])
  })

  it('还没开始播（index<0）：空数组', () => {
    const view = queueAxisView([item('x')], [item('a')], -1)
    expect(axisSnapOffsets(view)).toEqual([])
  })
})
