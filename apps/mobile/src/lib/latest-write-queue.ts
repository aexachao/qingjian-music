export class LatestWriteQueue<T> {
  private writing = false
  private pending: T | undefined

  constructor(private readonly write: (value: T) => Promise<void>) {}

  enqueue(value: T): Promise<void> {
    this.pending = value
    if (this.writing) return Promise.resolve()
    return this.flush()
  }

  private async flush(): Promise<void> {
    this.writing = true
    let firstError: unknown
    try {
      while (this.pending !== undefined) {
        const value = this.pending
        this.pending = undefined
        try {
          await this.write(value)
        } catch (error) {
          firstError ??= error
        }
      }
    } finally {
      this.writing = false
      // enqueue() may have happened during the final await; never leave it stranded.
      if (this.pending !== undefined) void this.flush()
    }
    if (firstError !== undefined) throw firstError
  }
}
