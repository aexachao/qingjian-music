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

  it('任务永不 settle 时会超时放行，不堵死后续操作', async () => {
    const queue = new AsyncMutationQueue()
    const stuck = deferred<void>()
    const steps: string[] = []

    // 模拟一次悬挂的原生调用 / 永不返回的网络请求
    const hung = queue.run(async () => {
      steps.push('hung:start')
      await stuck.promise
      steps.push('hung:end')
    }, { timeoutMs: 10, label: '悬挂任务' })

    const next = queue.run(async () => {
      steps.push('next')
      return 'ok'
    }, { timeoutMs: 1000 })

    await expect(hung).rejects.toThrow('悬挂任务 超时')
    // 关键：后续操作必须照常跑完，而不是一起被堵死
    await expect(next).resolves.toBe('ok')
    expect(steps).toEqual(['hung:start', 'next'])

    stuck.resolve()
  })

  it('超时值设为 0 时不启用看门狗', async () => {
    const queue = new AsyncMutationQueue()
    const gate = deferred<void>()
    const slow = queue.run(async () => {
      await gate.promise
      return 'done'
    }, { timeoutMs: 0 })

    let settled = false
    void slow.then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(settled).toBe(false)
    gate.resolve()
    await expect(slow).resolves.toBe('done')
  })
})
