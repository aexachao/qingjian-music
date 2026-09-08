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
    try {
      while (this.pending !== undefined) {
        const value = this.pending
        this.pending = undefined
        await this.write(value)
      }
    } finally {
      this.writing = false
    }
  }
}
