import { describe, expect, it } from 'vitest'
import { LatestWriteQueue } from '../../src/lib/latest-write-queue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('latest-write queue', () => {
  it('写入期间把多次更新合并为最后一份，且最终不会丢状态', async () => {
    const gate = deferred()
    const writes: number[] = []
    const queue = new LatestWriteQueue<number>(async (value) => {
      writes.push(value)
      if (value === 1) await gate.promise
    })

    const first = queue.enqueue(1)
    await Promise.resolve()
    await queue.enqueue(2)
    await queue.enqueue(3)
    expect(writes).toEqual([1])

    gate.resolve()
    await first
    expect(writes).toEqual([1, 3])
  })
})
