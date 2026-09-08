export class StorageMutationQueue {
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
