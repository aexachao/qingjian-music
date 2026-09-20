import { describe, expect, it } from 'vitest'
import type { BackgroundTask } from '@qj/core-domain'
import {
  findScanTask,
  hasActiveScan,
  libraryDisplayName,
  libraryUpdatedLabel,
  scanProgressView,
} from '../../src/lib/scan-progress-policy'

function task(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: 't1',
    type: 'fileScan',
    name: '音乐',
    successCount: 0,
    total: 0,
    failCount: 0,
    done: false,
    canceled: false,
    libraryId: 'lib1',
    ...overrides,
  }
}

describe('scanProgressView', () => {
  it('无任务 → idle', () => {
    const v = scanProgressView(undefined)
    expect(v.phase).toBe('idle')
    expect(v.label).toBe('')
  })

  it('分母还在涨（已处理 < 总数）→ scanning，显示 已处理/总数 + 百分比（对齐飞牛）', () => {
    const v = scanProgressView(task({ successCount: 480, total: 512 }))
    expect(v.phase).toBe('scanning')
    // 飞牛做法：按 已处理/总数 算并显示百分比
    expect(v.percent).toBe(93)
    expect(v.label).toContain('480')
    expect(v.label).toContain('512')
    expect(v.label).toContain('93%')
  })

  it('已处理数追上总数但未 done → finalizing「正在整理」，百分比 100', () => {
    const v = scanProgressView(task({ successCount: 34338, total: 34338 }))
    expect(v.phase).toBe('finalizing')
    expect(v.label).toContain('正在整理')
    expect(v.percent).toBe(100)
  })

  it('done → 完成态，带千分位，百分比 100', () => {
    const v = scanProgressView(task({ successCount: 34336, total: 34338, done: true }))
    expect(v.phase).toBe('done')
    expect(v.label).toContain('34,338')
    expect(v.percent).toBe(100)
  })

  it('canceled → idle 文案', () => {
    const v = scanProgressView(task({ canceled: true, total: 100 }))
    expect(v.phase).toBe('idle')
    expect(v.label).toBe('扫描已取消')
  })

  it('failCount 1~2 不当异常，只给一行提示', () => {
    const v = scanProgressView(task({ successCount: 34336, failCount: 2, total: 34338, done: true }))
    expect(v.failed).toBe(2)
    expect(v.failedLabel).toContain('2 个文件未能识别')
    // processed = success + fail
    expect(v.processed).toBe(34338)
  })

  it('无失败时 failedLabel 为空', () => {
    const v = scanProgressView(task({ successCount: 100, total: 100, done: true }))
    expect(v.failedLabel).toBe('')
  })
})

describe('findScanTask / hasActiveScan', () => {
  const running = task({ id: 'a', libraryId: 'lib1', done: false })
  const finished = task({ id: 'b', libraryId: 'lib1', done: true })
  const other = task({ id: 'c', libraryId: 'lib2', done: false })

  it('优先返回本库未完成的任务', () => {
    expect(findScanTask([finished, running, other], 'lib1')?.id).toBe('a')
  })

  it('本库只有已完成任务时返回它', () => {
    expect(findScanTask([finished, other], 'lib1')?.id).toBe('b')
  })

  it('非 fileScan 类型不算', () => {
    const t = task({ id: 'x', type: 'other', done: false })
    expect(findScanTask([t], 'lib1')).toBeUndefined()
  })

  it('hasActiveScan：有未完成 fileScan 就为真', () => {
    expect(hasActiveScan([finished])).toBe(false)
    expect(hasActiveScan([finished, running])).toBe(true)
  })
})

describe('libraryDisplayName', () => {
  it('有名字用名字', () => {
    expect(libraryDisplayName('我的音乐', '/vol2/music')).toBe('我的音乐')
  })

  it('名字是空串 → 取路径末段', () => {
    expect(libraryDisplayName('', '/vol2/1000/MyCloud/Downloads/test')).toBe('test')
  })

  it('名字空、路径也空 → 兜底「音乐库」', () => {
    expect(libraryDisplayName('', '')).toBe('音乐库')
  })
})

describe('libraryUpdatedLabel', () => {
  const now = new Date('2026-09-20T18:00:00')

  it('同年 → 月-日 时:分', () => {
    // 2026-09-20 14:32 本地时间
    const ts = Math.floor(new Date('2026-09-20T14:32:00').getTime() / 1000)
    expect(libraryUpdatedLabel(ts, now)).toBe('最近更新 09-20 14:32')
  })

  it('跨年 → 带年份', () => {
    const ts = Math.floor(new Date('2025-01-05T09:07:00').getTime() / 1000)
    expect(libraryUpdatedLabel(ts, now)).toBe('最近更新 2025-01-05 09:07')
  })

  it('无时间戳 → 空串', () => {
    expect(libraryUpdatedLabel(undefined, now)).toBe('')
    expect(libraryUpdatedLabel(0, now)).toBe('')
  })
})
