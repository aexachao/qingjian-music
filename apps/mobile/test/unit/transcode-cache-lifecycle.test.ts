import { beforeEach, expect, it, vi } from 'vitest'

const network = vi.hoisted(() => ({
  signal: undefined as AbortSignal | undefined,
  cancel: vi.fn(),
  requests: [] as Array<{ url: string; signal: AbortSignal; resolve: (text: string) => void }>,
}))

vi.mock('../../src/lib/bounded-fetch', () => ({
  fetchBoundedText: (url: string, options: { signal: AbortSignal }) => {
    network.signal = options.signal
    return new Promise<string>((resolve, reject) => {
      network.requests.push({ url, signal: options.signal, resolve })
      options.signal.addEventListener('abort', () => {
        network.cancel()
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      }, { once: true })
    })
  },
  fetchBoundedBytes: () => Promise.resolve(new Uint8Array()),
  BoundedFetchError: class BoundedFetchError extends Error {},
}))

vi.mock('expo-file-system', () => {
  class Directory {
    uri: string
    constructor(...parts: any[]) { this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/') }
  }
  class File {
    uri: string
    constructor(...parts: any[]) { this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/') }
    get exists() { return false }
  }
  return { Directory, File, Paths: { cache: 'cache' } }
})

vi.mock('../../src/lib/cache-preferences', () => ({ isAutoCacheEnabled: () => true }))
vi.mock('../../src/player/audio-cache', () => ({
  cacheAudioDirectory: () => ({ uri: 'cache/audio' }),
  cachedUriByName: () => undefined,
  registerCacheEntry: () => true,
  removeCacheEntry: () => undefined,
  reserveCacheSpace: () => true,
  releaseCacheSpace: () => undefined,
}))

beforeEach(() => {
  network.signal = undefined
  network.cancel.mockClear()
  network.requests.length = 0
  vi.resetModules()
})

it('queues transcode work FIFO, dedupes queued identities, and starts after the active slot frees', async () => {
  const transcode = await import('../../src/player/transcode-cache')
  const first = transcode.startTranscodeCaching({ serverId: 's', trackId: 'one', playlistUrl: 'https://example.invalid/one', sourceDurationSeconds: 60 })
  await vi.waitFor(() => expect(network.requests.map((request) => request.url)).toEqual(['https://example.invalid/one']))
  const queued = transcode.startTranscodeCaching({ serverId: 's', trackId: 'two', playlistUrl: 'https://example.invalid/two', sourceDurationSeconds: 60 })
  const duplicate = transcode.startTranscodeCaching({ serverId: 's', trackId: 'two', playlistUrl: 'https://example.invalid/two-duplicate', sourceDurationSeconds: 60 })
  expect(duplicate).toBe(queued)
  expect(network.requests).toHaveLength(1)
  network.requests[0].resolve('invalid playlist')
  await vi.waitFor(() => expect(network.requests.map((request) => request.url)).toEqual([
    'https://example.invalid/one',
    'https://example.invalid/two',
  ]))
  transcode.abortTranscodeCaching()
  await vi.waitFor(() => expect(network.cancel).toHaveBeenCalled())
  await expect(first).resolves.toBeUndefined()
  await expect(queued).resolves.toBeUndefined()
})

it('does not start queued transcode work after abort', async () => {
  const transcode = await import('../../src/player/transcode-cache')
  const active = transcode.startTranscodeCaching({ serverId: 's', trackId: 'one', playlistUrl: 'https://example.invalid/one', sourceDurationSeconds: 60 })
  await vi.waitFor(() => expect(network.requests).toHaveLength(1))
  const queued = transcode.startTranscodeCaching({ serverId: 's', trackId: 'two', playlistUrl: 'https://example.invalid/two', sourceDurationSeconds: 60 })
  transcode.abortTranscodeCaching()
  await vi.waitFor(() => expect(network.cancel).toHaveBeenCalled())
  expect(network.requests.map((request) => request.url)).toEqual(['https://example.invalid/one'])
  await expect(active).resolves.toBeUndefined()
  await expect(queued).resolves.toBeUndefined()
})

it('retries the newest same-file transcode input after its stale active session ends', async () => {
  const transcode = await import('../../src/player/transcode-cache')
  let oldInvalid = false
  const oldPromise = transcode.startTranscodeCaching({
    serverId: 's',
    trackId: 'same',
    playlistUrl: 'https://example.invalid/old-session',
    sourceDurationSeconds: 60,
    shouldAbort: () => oldInvalid,
  })
  await vi.waitFor(() => expect(network.requests).toHaveLength(1))

  oldInvalid = true
  const newPromise = transcode.startTranscodeCaching({
    serverId: 's',
    trackId: 'same',
    playlistUrl: 'https://example.invalid/new-session',
    sourceDurationSeconds: 60,
    shouldAbort: () => false,
  })
  const duplicateNewPromise = transcode.startTranscodeCaching({
    serverId: 's',
    trackId: 'same',
    playlistUrl: 'https://example.invalid/new-duplicate',
    sourceDurationSeconds: 60,
    shouldAbort: () => false,
  })
  expect(newPromise).not.toBe(oldPromise)
  expect(duplicateNewPromise).toBe(newPromise)
  await vi.waitFor(() => expect(network.requests.map((request) => request.url)).toEqual([
    'https://example.invalid/old-session',
    'https://example.invalid/new-session',
  ]))
  expect(network.requests[0].signal.aborted).toBe(true)
  network.requests[1].resolve('invalid playlist')
  await expect(Promise.all([oldPromise, newPromise])).resolves.toEqual([undefined, undefined])
})

it('bounds queued transcode work, keeping the newest requests and settling dropped work', async () => {
  const transcode = await import('../../src/player/transcode-cache')
  const active = transcode.startTranscodeCaching({
    serverId: 's', trackId: 'active', playlistUrl: 'https://example.invalid/active', sourceDurationSeconds: 60,
  })
  await vi.waitFor(() => expect(network.requests).toHaveLength(1))
  const queued = Array.from({ length: 9 }, (_, index) => transcode.startTranscodeCaching({
    serverId: 's',
    trackId: `queued-${index}`,
    playlistUrl: `https://example.invalid/queued-${index}`,
    sourceDurationSeconds: 60,
  }))
  await queued[0]
  network.requests[0].resolve('invalid playlist')
  await vi.waitFor(() => expect(network.requests.map((request) => request.url)).toEqual([
    'https://example.invalid/active',
    'https://example.invalid/queued-1',
  ]))
  transcode.abortTranscodeCaching()
  await expect(Promise.all([active, ...queued])).resolves.toHaveLength(10)
  expect(network.requests.map((request) => request.url)).not.toContain('https://example.invalid/queued-0')
})

it('retries the same transcode key after cache abort advances the epoch', async () => {
  const transcode = await import('../../src/player/transcode-cache')
  const oldPromise = transcode.startTranscodeCaching({
    serverId: 's', trackId: 'same', playlistUrl: 'https://example.invalid/old', sourceDurationSeconds: 60,
  })
  await vi.waitFor(() => expect(network.requests).toHaveLength(1))
  transcode.abortTranscodeCaching()
  const newPromise = transcode.startTranscodeCaching({
    serverId: 's', trackId: 'same', playlistUrl: 'https://example.invalid/new', sourceDurationSeconds: 60,
  })
  expect(newPromise).not.toBe(oldPromise)
  await vi.waitFor(() => expect(network.requests.map((request) => request.url)).toEqual([
    'https://example.invalid/old',
    'https://example.invalid/new',
  ]))
  network.requests[1].resolve('invalid playlist')
  await expect(Promise.all([oldPromise, newPromise])).resolves.toEqual([undefined, undefined])
})

it('aborting transcode caching aborts the in-flight playlist body operation', async () => {
  const transcode = await import('../../src/player/transcode-cache')
  transcode.startTranscodeCaching({
    serverId: 's',
    trackId: 't',
    playlistUrl: 'https://example.invalid/playlist.m3u8',
    sourceDurationSeconds: 60,
  })
  await vi.waitFor(() => expect(network.signal).toBeDefined())
  transcode.abortTranscodeCaching()
  await vi.waitFor(() => expect(network.cancel).toHaveBeenCalled())
  expect(network.signal?.aborted).toBe(true)
})
