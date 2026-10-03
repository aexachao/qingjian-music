import { isCancelledError, type QueryClient } from '@tanstack/react-query'
import type { QueueItem } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import { lyricQueryOptions } from './lyric-loader'

export const LYRIC_PREFETCH_AHEAD = 10
const CONCURRENCY = 2
const MISSING_PREFETCH_RETRY_MS = 60_000

/** Lyrics only: independent of audio download/cache preferences and file transfers. */
export function createLyricPrefetcher(client: QueryClient, provider: MusicProvider, serverId: string) {
  type Options = ReturnType<typeof lyricQueryOptions>
  let desired = new Map<string, Options>()
  const running = new Map<string, Options>()
  let completed = new Set<string>()
  let signature = ''
  let disposed = false

  const cancelUnused = () => {
    for (const [key, options] of running) {
      if (!desired.has(key)) {
        const query = client.getQueryCache().find({ queryKey: options.queryKey, exact: true })
        // A visible lyric page may have joined this same request. Leave that observer
        // in control; its source revision and disk-write guards isolate late results.
        if (query && query.getObserversCount() === 0) {
          void client.cancelQueries({ queryKey: options.queryKey, exact: true }).catch(() => undefined)
        }
      }
    }
  }
  const pump = () => {
    if (disposed) return
    for (const [key, options] of desired) {
      if (running.size >= CONCURRENCY) break
      if (running.has(key) || completed.has(key)) continue
      const cached = client.getQueryState(options.queryKey)
      // Rapid skipping must not keep searching the same missing lyric. A visible
      // page still refetches normally; new source revisions use a different key.
      if (cached?.data === null && Date.now() - cached.dataUpdatedAt < MISSING_PREFETCH_RETRY_MS) {
        completed.add(key)
        continue
      }
      running.set(key, options)
      void client.fetchQuery(options).then(
        () => { if (desired.has(key)) completed.add(key) },
        (error: unknown) => { if (!isCancelledError(error) && desired.has(key)) completed.add(key) },
      ).finally(() => {
        running.delete(key)
        pump()
      })
    }
  }
  return {
    update(items: readonly QueueItem[], allowed: boolean) {
      if (disposed) return
      const next = new Map<string, Options>()
      if (allowed) {
        for (const item of items.slice(0, LYRIC_PREFETCH_AHEAD + 1)) {
          if (item.serverId !== serverId || !item.title.trim()) continue
          const options = lyricQueryOptions(provider, serverId, item.trackId, {
            title: item.title, artist: item.artistText, album: item.albumText,
          })
          const key = JSON.stringify(options.queryKey)
          if (!next.has(key)) next.set(key, options)
        }
      }
      const nextSignature = JSON.stringify([...next.keys()])
      if (nextSignature === signature) return
      signature = nextSignature
      desired = next
      completed = new Set()
      cancelUnused()
      pump()
    },
    dispose() {
      disposed = true
      desired.clear()
      completed.clear()
      cancelUnused()
    },
  }
}
