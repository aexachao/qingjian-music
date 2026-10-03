import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import type { QueueItem } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'

const harness = vi.hoisted(() => ({ revision: 1, request: vi.fn() }))
vi.mock('../../src/lib/lyric-loader', () => ({
  lyricQueryOptions: (_provider: unknown, serverId: string, trackId: string, meta: unknown) => ({
    queryKey: ['lyrics', serverId, trackId, harness.revision],
    queryFn: ({ signal }: { signal: AbortSignal }) => harness.request(trackId, meta, signal),
    staleTime: 30 * 60_000,
  }),
}))
import { createLyricPrefetcher } from '../../src/lib/lyric-prefetch'
import { lyricQueryOptions } from '../../src/lib/lyric-loader'

let client: QueryClient
let prefetch: ReturnType<typeof createLyricPrefetcher>
let requests: { id: string; aborted: boolean; settled: boolean; finish: () => void }[]
const provider = {} as MusicProvider
const item = (i: number): QueueItem => ({ qid: `q${i}`, serverId: 's', trackId: `t${i}`, title: `Title ${i}`, artistText: 'Artist', durationMs: 180000 })
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
beforeEach(() => {
  harness.revision = 1
  requests = []
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  prefetch = createLyricPrefetcher(client, provider, 's')
  harness.request.mockReset().mockImplementation((id: string, _meta: unknown, signal: AbortSignal) => new Promise((resolve, reject) => {
    const entry = { id, aborted: false, settled: false, finish: () => { entry.settled = true; resolve(null) } }
    requests.push(entry)
    signal.addEventListener('abort', () => { entry.aborted = true; reject(new Error('aborted')) }, { once: true })
  }))
})
afterEach(() => { prefetch.dispose(); client.clear() })
it('prioritizes current song, limits to ten ahead and at most two simultaneous lyric requests', async () => {
  prefetch.update(Array.from({ length: 25 }, (_, i) => item(i)), true)
  expect(requests.map((r) => r.id)).toEqual(['t0', 't1'])
  for (let i = 0; i < 11; i++) {
    const pending = requests.find((r) => !r.settled && !r.aborted)
    expect(pending).toBeDefined()
    pending!.finish()
    await flush()
    expect(requests.filter((r) => !r.settled && !r.aborted).length).toBeLessThanOrEqual(2)
  }
  expect(requests).toHaveLength(11)
  expect(harness.request).toHaveBeenCalledWith('t0', { title: 'Title 0', artist: 'Artist', album: undefined }, expect.any(AbortSignal))
})
it('coalesces duplicate songs and does not poll a completed missing result on unrelated updates', async () => {
  prefetch.update([item(0), { ...item(0), qid: 'another-occurrence' }], true)
  requests[0]!.finish()
  await flush()
  for (let i = 0; i < 20; i++) prefetch.update([item(0), { ...item(0), qid: 'another-occurrence' }], true)
  expect(requests).toHaveLength(1)
})
it('source changes abort unused old requests and fetch the same song with the new source key', async () => {
  prefetch.update([item(0), item(1), item(2)], true)
  harness.revision = 2
  prefetch.update([item(0), item(1), item(2)], true)
  await flush()
  expect(requests.slice(0, 2).every((r) => r.aborted)).toBe(true)
  expect(requests.slice(2).map((r) => r.id)).toEqual(['t0', 't1'])
  expect(client.getQueryState(['lyrics', 's', 't0', 2])?.fetchStatus).toBe('fetching')
})
it('policy/background stop cancels speculative requests and a resumed window can restart', async () => {
  prefetch.update([item(0), item(1)], false)
  expect(requests).toHaveLength(0)
  prefetch.update([item(0), item(1)], true)
  prefetch.update([item(0), item(1)], false)
  await flush()
  expect(requests.every((r) => r.aborted)).toBe(true)
  prefetch.update([item(0), item(1)], true)
  await flush()
  expect(requests).toHaveLength(4)
})
it('does not cancel a shared request that the visible lyric page has joined', async () => {
  prefetch.update([item(0)], true)
  const observer = new QueryObserver(client, lyricQueryOptions(provider, 's', 't0', { title: 'Title 0', artist: 'Artist' }))
  const unsubscribe = observer.subscribe(() => undefined)
  prefetch.update([], false)
  await flush()
  expect(requests).toHaveLength(1)
  expect(requests[0]!.aborted).toBe(false)
  requests[0]!.finish()
  await flush()
  expect(observer.getCurrentResult().data).toBeNull()
  unsubscribe()
})
it('ignores another server and skips network for a still-fresh prefetched sheet', async () => {
  client.setQueryData(['lyrics', 's', 't0', 1], { lines: [{ text: 'cached' }] })
  prefetch.update([item(0), { ...item(1), serverId: 'other' }], true)
  await flush()
  expect(requests).toHaveLength(0)
})
it('disposing cancels pending work and cannot start more after a late completion', async () => {
  prefetch.update([item(0), item(1), item(2)], true)
  prefetch.dispose()
  await flush()
  requests[0]!.finish()
  prefetch.update([item(3)], true)
  await flush()
  expect(requests).toHaveLength(2)
  expect(requests.every((r) => r.aborted)).toBe(true)
})
