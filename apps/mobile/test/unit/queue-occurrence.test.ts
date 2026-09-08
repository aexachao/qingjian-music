import { describe, expect, it } from 'vitest'
import { QueueOccurrenceIds } from '../../src/player/queue-occurrence'

describe('队列 occurrence identity', () => {
  it('同一曲目重复入队会得到不同 qid', () => {
    const ids = new QueueOccurrenceIds('session-a')
    const first = ids.create('server', 'same-track')
    const second = ids.create('server', 'same-track')

    expect(first).not.toBe(second)
    expect(first).toContain('server:same-track:session-a:')
    expect(second).toContain('server:same-track:session-a:')
  })

  it('进程重启或热重载后的生成器不会复用旧会话 qid', () => {
    const beforeReload = new QueueOccurrenceIds('session-a').create('server', 'same-track')
    const afterReload = new QueueOccurrenceIds('session-b').create('server', 'same-track')

    expect(afterReload).not.toBe(beforeReload)
  })
})
