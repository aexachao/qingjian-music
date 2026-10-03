import { beforeEach, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({
  files: new Map<string, { content: string | Uint8Array; size: number; modified: number }>(),
  deleteFailures: new Set<string>(),
  auto: true,
  download: undefined as undefined | ((target: any, options: any) => Promise<any>),
}))

vi.mock('../../src/lib/cache-preferences', () => ({
  getCurrentCacheBudgetBytes: () => 100,
  getCurrentCacheCountLimit: () => 0,
  isAutoCacheEnabled: () => io.auto,
  registerCacheLimitEnforcer: () => undefined,
}))

vi.mock('expo-file-system', () => {
  const uri = (values: any[]) => values.map((value) => (typeof value === 'string' ? value : value.uri)).join('/')
  class Directory {
    uri: string
    constructor(...values: any[]) { this.uri = uri(values) }
    get exists() { return [...io.files.keys()].some((key) => key.startsWith(`${this.uri}/`)) }
    create() {}
    list() {
      const prefix = `${this.uri}/`
      return [...io.files.keys()]
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map((key) => new File(key))
    }
    delete() {
      if (io.deleteFailures.has(this.uri)) throw new Error('delete failed')
      for (const key of [...io.files.keys()]) if (key.startsWith(`${this.uri}/`)) io.files.delete(key)
    }
  }
  class File {
    uri: string
    constructor(...values: any[]) { this.uri = uri(values) }
    get name() { return this.uri.split('/').at(-1) ?? '' }
    get exists() { return io.files.has(this.uri) }
    get size() { return io.files.get(this.uri)?.size ?? 0 }
    get modificationTime() { return io.files.get(this.uri)?.modified ?? 0 }
    delete() {
      if (io.deleteFailures.has(this.uri)) throw new Error('delete failed')
      io.files.delete(this.uri)
    }
    textSync() { return io.files.get(this.uri)?.content as string }
    create() { io.files.set(this.uri, { content: '', size: 0, modified: Date.now() }) }
    write(content: string | Uint8Array, options: { append?: boolean } = {}) {
      const old = io.files.get(this.uri)
      const data = options.append && old?.content && typeof content === 'string' ? `${old.content}${content}` : content
      io.files.set(this.uri, { content: data, size: typeof data === 'string' ? data.length : data.byteLength, modified: Date.now() })
    }
    async move(destination: File) {
      const value = io.files.get(this.uri)
      if (value) io.files.set(destination.uri, value)
      io.files.delete(this.uri)
      this.uri = destination.uri
    }
    static downloadFileAsync(_url: string, destination: File, options: any) {
      return io.download ? io.download(destination, options) : Promise.resolve(destination)
    }
  }
  return { Directory, File, Paths: { cache: 'cache' } }
})

beforeEach(() => {
  io.files.clear()
  io.deleteFailures.clear()
  io.auto = true
  io.download = undefined
  vi.resetModules()
})

function seedAudio(name: string, size: number, lastUsedAt = 1) {
  io.files.set(`cache/audio/${name}`, { content: 'x', size, modified: lastUsedAt })
  io.files.set('cache/audio/index.json', {
    content: JSON.stringify({ version: 1, entries: { [name]: { size, lastUsedAt } } }),
    size: 1,
    modified: 1,
  })
}

it('preserves useful audio files when one cache item cannot fit the byte budget', async () => {
  seedAudio('old.flac', 50)
  const cache = await import('../../src/player/audio-cache')
  expect(cache.reserveCacheSpace(200, 'too-large.flac')).toBe(false)
  expect(io.files.has('cache/audio/old.flac')).toBe(true)
})

it('keeps temporary parts out of cache stats and accounts for outstanding reservations', async () => {
  io.files.set('cache/audio/unfinished.flac.part', { content: 'partial', size: 70, modified: 1 })
  const cache = await import('../../src/player/audio-cache')
  expect(cache.audioCacheStats()).toMatchObject({ bytes: 0, files: 0 })
  expect(cache.reserveCacheSpace(60, 'first.flac')).toBe(true)
  expect(cache.reserveCacheSpace(50, 'second.flac')).toBe(false)
  cache.releaseCacheSpace('first.flac')
  expect(cache.reserveCacheSpace(50, 'second.flac')).toBe(true)
})

it('preserves protected audio when the remaining cache capacity is insufficient', async () => {
  seedAudio('s_protected.flac', 80)
  const cache = await import('../../src/player/audio-cache')
  cache.protectTracks([{ serverId: 's', trackId: 'protected', format: 'flac' }])
  expect(cache.reserveCacheSpace(30, 'incoming.flac')).toBe(false)
  expect(io.files.has('cache/audio/s_protected.flac')).toBe(true)
})

it('protects the transcode filename for a supplied track identity', async () => {
  seedAudio('s_protected.mp4', 80)
  const cache = await import('../../src/player/audio-cache')
  cache.protectTracks([{ serverId: 's', trackId: 'protected', format: 'wma' }])
  expect(cache.reserveCacheSpace(30, 'incoming.flac')).toBe(false)
  expect(io.files.has('cache/audio/s_protected.mp4')).toBe(true)
})

it('aborts an in-flight audio download when clearing advances the cache generation', async () => {
  const cache = await import('../../src/player/audio-cache')
  let signal: AbortSignal | undefined
  let finish!: () => void
  io.download = (target, options) => {
    signal = options.signal
    return new Promise((resolve, reject) => {
      finish = () => {
        io.files.set(target.uri, { content: 'audio', size: 20, modified: Date.now() })
        resolve(target)
      }
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
    })
  }
  const task = cache.cacheAudio({ serverId: 's', trackId: 't', format: 'flac' }, { url: 'https://example.invalid/audio' } as any)
  await Promise.resolve()
  expect(cache.clearAudioCache()).toBe(true)
  expect(signal?.aborted).toBe(true)
  finish()
  await task
  expect(io.files.has('cache/audio/s_t.flac')).toBe(false)
})

it('queues audio downloads FIFO, shares duplicate work, and starts the next item when a slot frees', async () => {
  const cache = await import('../../src/player/audio-cache')
  const started: string[] = []
  const finishers: Array<() => void> = []
  io.download = (target) => new Promise((resolve) => {
    started.push(target.name)
    finishers.push(() => {
      io.files.set(target.uri, { content: 'audio', size: 10, modified: Date.now() })
      resolve(target)
    })
  })
  const resource = { url: 'https://example.invalid/audio' } as any
  const first = cache.cacheAudio({ serverId: 's', trackId: 'one', format: 'flac' }, resource)
  const second = cache.cacheAudio({ serverId: 's', trackId: 'two', format: 'flac' }, resource)
  const duplicate = cache.cacheAudio({ serverId: 's', trackId: 'two', format: 'flac' }, resource)
  const third = cache.cacheAudio({ serverId: 's', trackId: 'three', format: 'flac' }, resource)
  expect(started).toEqual(['s_one.flac.part', 's_two.flac.part'])
  finishers[0]()
  await vi.waitFor(() => expect(started).toEqual(['s_one.flac.part', 's_two.flac.part', 's_three.flac.part']))
  finishers[1]()
  finishers[2]()
  await Promise.all([first, second, duplicate, third])
  expect(started).toHaveLength(3)
})

it('drops queued audio jobs after abort without starting a later write', async () => {
  const cache = await import('../../src/player/audio-cache')
  const started: string[] = []
  const finishers: Array<() => void> = []
  io.download = (target) => new Promise((resolve) => {
    started.push(target.name)
    finishers.push(() => {
      io.files.set(target.uri, { content: 'audio', size: 10, modified: Date.now() })
      resolve(target)
    })
  })
  const resource = { url: 'https://example.invalid/audio' } as any
  const first = cache.cacheAudio({ serverId: 's', trackId: 'one', format: 'flac' }, resource)
  const second = cache.cacheAudio({ serverId: 's', trackId: 'two', format: 'flac' }, resource)
  const queued = cache.cacheAudio({ serverId: 's', trackId: 'queued', format: 'flac' }, resource)
  cache.abortAudioCaching()
  finishers[0]()
  finishers[1]()
  await Promise.all([first, second, queued])
  expect(started).toEqual(['s_one.flac.part', 's_two.flac.part'])
  expect(io.files.has('cache/audio/s_queued.flac')).toBe(false)
})

it('does not start queued audio after automatic caching is disabled', async () => {
  const cache = await import('../../src/player/audio-cache')
  const started: string[] = []
  const finishers: Array<() => void> = []
  io.download = (target) => new Promise((resolve) => {
    started.push(target.name)
    finishers.push(() => {
      io.files.set(target.uri, { content: 'audio', size: 10, modified: Date.now() })
      resolve(target)
    })
  })
  const resource = { url: 'https://example.invalid/audio' } as any
  const first = cache.cacheAudio({ serverId: 's', trackId: 'one', format: 'flac' }, resource)
  const second = cache.cacheAudio({ serverId: 's', trackId: 'two', format: 'flac' }, resource)
  const queued = cache.cacheAudio({ serverId: 's', trackId: 'queued', format: 'flac' }, resource)
  io.auto = false
  finishers[0]()
  finishers[1]()
  await Promise.all([first, second, queued])
  expect(started).toEqual(['s_one.flac.part', 's_two.flac.part'])
  expect(io.files.has('cache/audio/s_queued.flac')).toBe(false)
})

it('prunes stale queued audio when a fresh playback window arrives', async () => {
  const cache = await import('../../src/player/audio-cache')
  const started: string[] = []
  const finishers: Array<() => void> = []
  io.download = (target) => new Promise((resolve) => {
    started.push(target.name)
    finishers.push(() => {
      io.files.set(target.uri, { content: 'audio', size: 10, modified: Date.now() })
      resolve(target)
    })
  })
  const resource = { url: 'https://example.invalid/audio' } as any
  const activeOne = cache.cacheAudio({ serverId: 's', trackId: 'active-one', format: 'flac' }, resource)
  const activeTwo = cache.cacheAudio({ serverId: 's', trackId: 'active-two', format: 'flac' }, resource)
  let stale = false
  const oldOne = cache.cacheAudio({ serverId: 's', trackId: 'old-one', format: 'flac' }, resource, { shouldAbort: () => stale })
  const oldTwo = cache.cacheAudio({ serverId: 's', trackId: 'old-two', format: 'flac' }, resource, { shouldAbort: () => stale })
  stale = true
  const next = cache.cacheAudio({ serverId: 's', trackId: 'next', format: 'flac' }, resource, { shouldAbort: () => false })
  await Promise.all([oldOne, oldTwo])
  finishers[0]()
  await vi.waitFor(() => expect(started).toContain('s_next.flac.part'))
  finishers[1]()
  finishers[2]()
  await Promise.all([activeOne, activeTwo, next])
  expect(started).toEqual(['s_active-one.flac.part', 's_active-two.flac.part', 's_next.flac.part'])
})

it('bounds queued audio work and settles the oldest dropped background request', async () => {
  const cache = await import('../../src/player/audio-cache')
  const started: string[] = []
  const finishers: Array<() => void> = []
  io.download = (target) => new Promise((resolve) => {
    started.push(target.name)
    finishers.push(() => {
      io.files.set(target.uri, { content: 'audio', size: 10, modified: Date.now() })
      resolve(target)
    })
  })
  const resource = { url: 'https://example.invalid/audio' } as any
  const activeOne = cache.cacheAudio({ serverId: 's', trackId: 'active-one', format: 'flac' }, resource)
  const activeTwo = cache.cacheAudio({ serverId: 's', trackId: 'active-two', format: 'flac' }, resource)
  const queued = Array.from({ length: 9 }, (_, index) => cache.cacheAudio({
    serverId: 's', trackId: `queued-${index}`, format: 'flac',
  }, resource))
  await queued[0]
  finishers[0]()
  await vi.waitFor(() => expect(started).toContain('s_queued-1.flac.part'))
  cache.abortAudioCaching()
  finishers[1]()
  finishers[2]()
  await Promise.all([activeOne, activeTwo, ...queued])
  expect(started).not.toContain('s_queued-0.flac.part')
})

it('retries the same audio key after cache abort advances its generation', async () => {
  const cache = await import('../../src/player/audio-cache')
  const started: string[] = []
  const finishers: Array<() => void> = []
  io.download = (target) => new Promise((resolve) => {
    started.push(target.name)
    finishers.push(() => {
      io.files.set(target.uri, { content: 'audio', size: 10, modified: Date.now() })
      resolve(target)
    })
  })
  const target = { serverId: 's', trackId: 'same', format: 'flac' }
  const resource = { url: 'https://example.invalid/audio' } as any
  const oldPromise = cache.cacheAudio(target, resource)
  cache.abortAudioCaching()
  const newPromise = cache.cacheAudio(target, resource)
  finishers[0]()
  await vi.waitFor(() => expect(started).toEqual(['s_same.flac.part', 's_same.flac.part']))
  finishers[1]()
  await Promise.all([oldPromise, newPromise])
  expect(io.files.has('cache/audio/s_same.flac')).toBe(true)
})

it('serializes same-key retries after abort and dedupes replacement requests', async () => {
  const cache = await import('../../src/player/audio-cache')
  const started: string[] = []
  const finishers: Array<() => void> = []
  let signals: AbortSignal[] = []
  io.download = (target, options) => new Promise((resolve) => {
    started.push(target.name)
    signals.push(options.signal)
    finishers.push(() => {
      io.files.set(target.uri, { content: 'audio', size: 10, modified: Date.now() })
      resolve(target)
    })
  })
  const target = { serverId: 's', trackId: 'same', format: 'flac' }
  const resource = { url: 'https://example.invalid/audio' } as any
  const oldPromise = cache.cacheAudio(target, resource)
  cache.abortAudioCaching()
  const replacement = cache.cacheAudio(target, resource)
  const duplicateReplacement = cache.cacheAudio(target, resource)
  expect(started).toEqual(['s_same.flac.part'])
  expect(signals[0].aborted).toBe(true)
  finishers[0]()
  await vi.waitFor(() => expect(started).toEqual(['s_same.flac.part', 's_same.flac.part']))
  finishers[1]()
  await Promise.all([oldPromise, replacement, duplicateReplacement])
  expect(started).toHaveLength(2)
})

it('does not abort a healthy active audio download when its scheduler window expires', async () => {
  const cache = await import('../../src/player/audio-cache')
  const started: string[] = []
  let finish!: () => void
  let signal: AbortSignal | undefined
  io.download = (target, options) => new Promise((resolve) => {
    started.push(target.name)
    signal = options.signal
    finish = () => {
      io.files.set(target.uri, { content: 'audio', size: 10, modified: Date.now() })
      resolve(target)
    }
  })
  const target = { serverId: 's', trackId: 'healthy', format: 'flac' }
  const resource = { url: 'https://example.invalid/audio' } as any
  let oldWindowExpired = false
  const active = cache.cacheAudio(target, resource, { shouldAbort: () => oldWindowExpired })
  oldWindowExpired = true
  const resumed = cache.cacheAudio(target, resource, { shouldAbort: () => false })
  expect(started).toEqual(['s_healthy.flac.part'])
  expect(signal?.aborted).toBe(false)
  finish()
  await Promise.all([active, resumed])
  expect(started).toHaveLength(1)
})

it('does not commit an audio download completed after auto-cache is turned off', async () => {
  const cache = await import('../../src/player/audio-cache')
  let finish!: () => void
  io.download = (target) => new Promise((resolve) => {
    finish = () => {
      io.files.set(target.uri, { content: 'audio', size: 20, modified: Date.now() })
      resolve(target)
    }
  })
  const task = cache.cacheAudio({ serverId: 's', trackId: 't', format: 'flac' }, { url: 'https://example.invalid/audio' } as any)
  await Promise.resolve()
  io.auto = false
  finish()
  await task
  expect(io.files.has('cache/audio/s_t.flac')).toBe(false)
})

it('keeps undeleted audio in cache statistics and rejects an over-quota reservation', async () => {
  seedAudio('old.flac', 80)
  io.deleteFailures.add('cache/audio/old.flac')
  const cache = await import('../../src/player/audio-cache')
  expect(cache.reserveCacheSpace(30, 'new.flac')).toBe(false)
  expect(cache.audioCacheStats()).toMatchObject({ bytes: 80, files: 1 })
})

it('blocks an in-flight lyric write after clearing an empty cache', async () => {
  const lyrics = await import('../../src/lib/lyric-cache')
  const generation = lyrics.captureLyricCacheGeneration()
  const cleared = lyrics.clearLyricCache()
  expect(cleared.success).toBe(true)
  expect(lyrics.writeCachedLyric('s', 't', { tier: 'plain', lines: [] } as any, { generation })).toBe(false)
  expect(lyrics.lyricCacheStats().files).toBe(0)
})

it('clears persisted lyric index entries along with their files', async () => {
  const name = 's__t__plain.json'
  io.files.set(`cache/lyrics/${name}`, { content: '{"tier":"plain","lines":[]}', size: 30, modified: 1 })
  io.files.set('cache/lyrics/index.json', {
    content: JSON.stringify({ version: 1, entries: { 's__t__plain': { tier: 'plain', offsetMs: 0, fetchedAt: 1, lastUsedAt: 1 } } }),
    size: 1,
    modified: 1,
  })
  const lyrics = await import('../../src/lib/lyric-cache')
  expect(lyrics.clearLyricCache()).toMatchObject({ removed: 1, remaining: 0, success: true })
  expect(lyrics.lyricCacheStats().files).toBe(0)
  expect(JSON.parse(io.files.get('cache/lyrics/index.json')!.content as string).entries).toEqual({})
})

it('reports undeleted lyric files and keeps them indexed after a clear attempt', async () => {
  const name = 's__t__plain.json'
  io.files.set(`cache/lyrics/${name}`, { content: '{"tier":"plain","lines":[]}', size: 30, modified: 1 })
  io.files.set('cache/lyrics/index.json', {
    content: JSON.stringify({ version: 1, entries: { 's__t__plain': { tier: 'plain', offsetMs: 0, fetchedAt: 1, lastUsedAt: 1 } } }),
    size: 1,
    modified: 1,
  })
  io.deleteFailures.add(`cache/lyrics/${name}`)
  const lyrics = await import('../../src/lib/lyric-cache')
  expect(lyrics.clearLyricCache()).toMatchObject({ removed: 0, remaining: 1, success: false })
  expect(lyrics.lyricCacheStats().files).toBe(1)
})
