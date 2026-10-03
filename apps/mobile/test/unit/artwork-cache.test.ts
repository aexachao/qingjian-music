import { beforeEach, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  failDirectoryDelete: false,
  fetchBytes: vi.fn<(_url: string, _options: unknown) => Promise<Uint8Array>>(async () => new Uint8Array(16)),
}))

vi.mock('../../src/lib/bounded-fetch', () => ({
  fetchBoundedBytes: (url: string, options: unknown) => io.fetchBytes(url, options),
}))

vi.mock('expo-file-system', () => {
  const uri = (parts: any[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/')
  class Directory {
    uri: string
    constructor(...parts: any[]) { this.uri = uri(parts) }
    get exists() { return [...io.files.keys()].some((key) => key.startsWith(`${this.uri}/`)) }
    create() {}
    list() {
      const prefix = `${this.uri}/`
      return [...io.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => new File(key))
    }
    delete() {
      if (io.failDirectoryDelete) throw new Error('delete denied')
      for (const key of [...io.files.keys()]) if (key.startsWith(`${this.uri}/`)) io.files.delete(key)
    }
  }
  class File {
    uri: string
    constructor(...parts: any[]) { this.uri = uri(parts) }
    get name() { return this.uri.split('/').at(-1) ?? '' }
    get exists() { return io.files.has(this.uri) }
    get size() { return io.files.get(this.uri)?.byteLength ?? 0 }
    get modificationTime() { return 1 }
    write(bytes: Uint8Array) { io.files.set(this.uri, bytes) }
    delete() { io.files.delete(this.uri) }
  }
  return { Directory, File, Paths: { cache: 'cache' } }
})

beforeEach(() => {
  io.files.clear()
  io.fetchBytes.mockReset().mockImplementation(async () => new Uint8Array(16))
  io.failDirectoryDelete = false
  vi.resetModules()
})

it('reuses one bounded disk entry for repeated requests with the same artwork identity', async () => {
  const artwork = await import('../../src/player/artwork')
  const resource = { url: 'https://example.invalid/cover', headers: { Authorization: 'secret' } } as any
  const first = await artwork.cacheArtwork('server:cover:version-1', resource)
  const second = await artwork.cacheArtwork('server:cover:version-1', resource)
  expect(first).toBe(second)
  expect(io.fetchBytes).toHaveBeenCalledTimes(1)
  expect(io.files.size).toBe(1)
})

it('clears after cache hits, then refetches and leaves download slots available', async () => {
  const artwork = await import('../../src/player/artwork')
  const resource = { url: 'https://example.invalid/cover' } as any
  await artwork.cacheArtwork('server:one:v1', resource)
  await artwork.cacheArtwork('server:two:v1', resource)
  expect(io.fetchBytes).toHaveBeenCalledTimes(2)

  await Promise.all([
    artwork.cacheArtwork('server:one:v1', resource),
    artwork.cacheArtwork('server:two:v1', resource),
  ])
  expect(artwork.clearArtworkCache()).toBe(true)

  await Promise.all([
    artwork.cacheArtwork('server:one:v1', resource),
    artwork.cacheArtwork('server:two:v1', resource),
  ])
  expect(io.fetchBytes).toHaveBeenCalledTimes(4)
})

it('reports an artwork directory deletion failure', async () => {
  const artwork = await import('../../src/player/artwork')
  io.files.set('cache/artwork/existing.img', new Uint8Array(1))
  io.failDirectoryDelete = true
  expect(artwork.clearArtworkCache()).toBe(false)
  expect(io.files.has('cache/artwork/existing.img')).toBe(true)
})

it('prioritizes a newly selected cover when two obsolete downloads fill the slots', async () => {
  const artwork = await import('../../src/player/artwork')
  let finishSecond!: (bytes: Uint8Array) => void
  const second = new Promise<Uint8Array>((resolve) => { finishSecond = resolve })
  io.fetchBytes.mockImplementation((url, options) => {
    if (url === 'third') return Promise.resolve(new Uint8Array(16))
    if (url === 'second') return second
    return new Promise<Uint8Array>((_resolve, reject) => {
      (options as { signal: AbortSignal }).signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
  })

  const old = artwork.cacheArtwork('old', { url: 'first', headers: {} })
  const other = artwork.cacheArtwork('other', { url: 'second', headers: {} })
  const current = artwork.cacheArtwork('current', { url: 'third', headers: {} })

  expect(await old).toBeUndefined()
  expect(await current).toContain('cache/artwork/')
  finishSecond(new Uint8Array(16))
  await other
  expect(io.fetchBytes).toHaveBeenCalledTimes(3)
})
