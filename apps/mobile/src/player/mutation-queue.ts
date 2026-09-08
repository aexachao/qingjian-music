/**
 * 串行化所有会改 RNTP 队列和 Zustand 镜像的操作，避免多个手势/起播请求互相穿插。
 * 单个任务失败不会毒化后续队列。
 */
export class AsyncMutationQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(mutation, mutation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
