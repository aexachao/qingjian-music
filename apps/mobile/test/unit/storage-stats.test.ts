import { beforeEach, describe, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({
  files: new Map<string, number>(),
  failedDirectories: new Set<string>(),
  total: 1_000_000,
  available: 400_000,
  downloadBytes: 200_000,
}))

vi.mock('expo-file-system', () => {
  const pathOf = (parts: any[]) => parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/')
  class Directory {
    uri: string
    constructor(...parts: any[]) { this.uri = pathOf(parts) }
    get exists() { return [...io.files.keys()].some((path) => path.startsWith(`${this.uri}/`)) }
    list() {
      if (io.failedDirectories.has(this.uri)) throw new Error('directory read failed')
      const prefix = `${this.uri}/`
      return [...io.files.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, size]) => new File(path, size))
    }
  }
  class File {
    uri: string
    size: number
    constructor(uri: string, size = 0) { this.uri = uri; this.size = size }
    get name() { return this.uri.split('/').at(-1) ?? '' }
  }
  return {
    Directory,
    File,
    Paths: {
      cache: 'cache',
      get totalDiskSpace() { return io.total },
      get availableDiskSpace() { return io.available },
    },
  }
})

vi.mock('../../src/player/downloads', () => ({
  downloadStats: () => ({ bytes: io.downloadBytes, count: 3 }),
}))

describe('readStorageSnapshot', () => {
  beforeEach(() => {
    io.files.clear()
    io.failedDirectories.clear()
    io.total = 1_000_000
    io.available = 400_000
    io.downloadBytes = 200_000
    vi.resetModules()
  })

  it('combines Expo disk space with app download and cache statistics', async () => {
    io.files.set('cache/audio/song.flac', 100_000)
    io.files.set('cache/audio/index.json', 100)
    io.files.set('cache/audio/unfinished.part', 900)
    io.files.set('cache/lyrics/server__track__line.json', 1_200)
    io.files.set('cache/lyrics/index.json', 100)
    io.files.set('cache/artwork/art_abc.img', 2_300)
    io.files.set('cache/artwork/unrelated.bin', 500)
    io.files.set('cache/artwork/nested/art_def.img', 700)
    const { readStorageSnapshot } = await import('../../src/lib/storage-stats')

    expect(readStorageSnapshot()).toEqual({
      totalBytes: 1_000_000,
      availableBytes: 400_000,
      downloadsBytes: 200_000,
      audioCacheFiles: 1,
      audioCacheBytes: 100_000,
      lyricCacheFiles: 1,
      lyricCacheBytes: 1_200,
      artworkCacheBytes: 2_300,
    })
  })

  it('keeps a failed limited directory read unknown instead of reporting zero', async () => {
    io.files.set('cache/artwork/art_abc.img', 100)
    io.failedDirectories.add('cache/artwork')
    const { readStorageSnapshot } = await import('../../src/lib/storage-stats')

    expect(readStorageSnapshot().artworkCacheBytes).toBeNull()
  })

  it('reports audio cache as unknown if its directory cannot be listed', async () => {
    io.files.set('cache/audio/song.flac', 100)
    io.failedDirectories.add('cache/audio')
    const { readStorageSnapshot } = await import('../../src/lib/storage-stats')

    expect(readStorageSnapshot().audioCacheBytes).toBeNull()
    expect(readStorageSnapshot().audioCacheFiles).toBeNull()
  })

  it('preserves zero as a measured value and reports invalid device readings as unknown', async () => {
    io.available = 0
    io.total = Number.NaN
    const { readStorageSnapshot } = await import('../../src/lib/storage-stats')
    const snapshot = readStorageSnapshot()

    expect(snapshot.availableBytes).toBe(0)
    expect(snapshot.totalBytes).toBeNull()
  })
})
