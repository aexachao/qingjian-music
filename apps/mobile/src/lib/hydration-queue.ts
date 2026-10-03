/**
 * Keeps synchronous UI mutations while an async persisted snapshot is loading,
 * then replays those mutations on the snapshot before exposing it as hydrated.
 * A failed read leaves mutations queued and never writes defaults over storage.
 */
export function createHydrationQueue<T>() {
  let hydrated = false
  let pending: ((value: T) => T)[] = []
  let inFlight: Promise<boolean> | undefined

  return {
    get hydrated() {
      return hydrated
    },
    queue(operation: (value: T) => T): void {
      if (!hydrated) pending.push(operation)
    },
    hydrate(read: () => Promise<T>, apply: (value: T, replayed: boolean) => void): Promise<boolean> {
      if (hydrated) return Promise.resolve(true)
      if (inFlight) return inFlight
      inFlight = (async () => {
        try {
          const persisted = await read()
          const replayed = pending.length > 0
          let result: T = persisted as T
          for (const operation of pending) result = operation(result)
          pending = []
          hydrated = true
          apply(result, replayed)
          return true
        } catch {
          // Keep operations queued. A later mutation retries the read.
          return false
        } finally {
          inFlight = undefined
        }
      })()
      return inFlight
    },
  }
}

/** Serializes native intent changes and prevents queued stale requests starting later. */
export function createLatestAsyncIntentQueue() {
  let sequence = 0
  let tail: Promise<void> = Promise.resolve()

  return {
    current(): number {
      return sequence
    },
    begin(): number {
      sequence += 1
      return sequence
    },
    isLatest(intent: number): boolean {
      return intent === sequence
    },
    run(intent: number, operation: () => Promise<void>): Promise<boolean> {
      const result = tail.catch(() => undefined).then(async () => {
        if (intent !== sequence) return false
        try {
          await operation()
        } catch (error) {
          if (intent === sequence) throw error
          return false
        }
        return intent === sequence
      })
      tail = result.then(() => undefined, () => undefined)
      return result
    },
  }
}
