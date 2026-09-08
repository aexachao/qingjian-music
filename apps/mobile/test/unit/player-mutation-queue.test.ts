import { describe, expect, it } from 'vitest'
import { AsyncMutationQueue } from '../../src/player/mutation-queue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('播放器 mutation 队列', () => {
  it('严格串行执行并发提交的操作', async () => {
    const queue = new AsyncMutationQueue()
    const gate = deferred<void>()
    const steps: string[] = []

    const first = queue.run(async () => {
      steps.push('first:start')
      await gate.promise
      steps.push('first:end')
    })
    const second = queue.run(async () => {
      steps.push('second:start')
    })

    await Promise.resolve()
    expect(steps).toEqual(['first:start'])
    gate.resolve()
    await Promise.all([first, second])
    expect(steps).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('前一个操作失败后仍会继续执行后续操作', async () => {
    const queue = new AsyncMutationQueue()
    const steps: string[] = []
    const failed = queue.run(async () => {
      steps.push('failed')
      throw new Error('expected')
    })
    const next = queue.run(async () => {
      steps.push('next')
      return 42
    })

    await expect(failed).rejects.toThrow('expected')
    await expect(next).resolves.toBe(42)
    expect(steps).toEqual(['failed', 'next'])
  })
})
