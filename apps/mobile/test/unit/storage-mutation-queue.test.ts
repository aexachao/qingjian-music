import { describe, expect, it } from 'vitest'
import { StorageMutationQueue } from '../../src/lib/storage-mutation-queue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('SecureStore mutation queue', () => {
  it('串行执行读改写，避免并发覆盖服务器列表', async () => {
    const gate = deferred()
    const order: string[] = []
    const queue = new StorageMutationQueue()
    const first = queue.run(async () => {
      order.push('first:start')
      await gate.promise
      order.push('first:end')
    })
    const second = queue.run(async () => {
      order.push('second')
    })

    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    gate.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })
})
