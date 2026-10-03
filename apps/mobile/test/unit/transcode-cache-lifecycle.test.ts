import { beforeEach, expect, it, vi } from 'vitest'

const network = vi.hoisted(() => ({ signal: undefined as AbortSignal | undefined, cancel: vi.fn() }))

vi.mock('../../src/lib/bounded-fetch', () => ({
  fetchBoundedText: (_url: string, options: { signal: AbortSignal }) => {
    network.signal = options.signal
    return new Promise<string>((_resolve, reject) => {
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
  vi.resetModules()
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
