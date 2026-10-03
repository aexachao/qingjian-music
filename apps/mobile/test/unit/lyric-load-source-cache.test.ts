import { beforeEach, expect, it, vi } from 'vitest'

const scenario = vi.hoisted(() => ({
  revision: 1,
  services: [] as { id: string; type: 'netease' | 'lrcapi' | 'qq'; baseUrl: string; token?: string; useLyrics: boolean; useMusicInfo: boolean }[],
  cached: null as null | { sheet: any; sourceIdentity?: string; sourceRevision?: number; metadataParsed?: boolean },
  externalResult: null as any,
  readCachedLyric: vi.fn(),
  writeCachedLyric: vi.fn(),
  fetchExternalLyricSheet: vi.fn(),
}))

vi.mock('../../src/lib/lyric-cache', () => ({
  captureLyricCacheGeneration: () => 12,
  readCachedLyric: (...args: any[]) => scenario.readCachedLyric(...args),
  writeCachedLyric: (...args: any[]) => scenario.writeCachedLyric(...args),
}))

vi.mock('../../src/lib/external-lyrics', () => ({
  fetchExternalLyricSheet: (...args: any[]) => scenario.fetchExternalLyricSheet(...args),
}))

vi.mock('../../src/lib/external-source', () => {
  const store: any = (selector: (state: typeof scenario) => unknown) => selector(scenario)
  store.getState = () => scenario
  return {
    useExternalSourcesStore: store,
    getLyricsSource: () => {
      const service = scenario.services.find((candidate) => candidate.useLyrics && candidate.baseUrl.trim())
      return service
        ? { type: service.type, baseUrl: service.baseUrl, token: service.token }
        : { type: 'none', baseUrl: '' }
    },
  }
})

vi.mock('../../src/lib/server-session', () => ({ useServerSession: () => ({ provider: null, connection: null }) }))
vi.mock('../../src/player/store', () => ({ selectCurrent: () => null, usePlayerStore: () => null }))

beforeEach(() => {
  scenario.revision = 1
  scenario.services = []
  scenario.cached = null
  scenario.externalResult = null
  scenario.readCachedLyric.mockReset().mockImplementation(() => scenario.cached)
  scenario.writeCachedLyric.mockReset()
  scenario.fetchExternalLyricSheet.mockReset().mockImplementation(() => Promise.resolve(scenario.externalResult))
  vi.resetModules()
})

function sheet(tier: 'word' | 'line' | 'plain', source: string) {
  return { tier, source, synced: true, offsetMs: 0, lines: [{ time: 1, text: source }] }
}

it('uses the current store revision and token-free identity when callers omit source parameters', async () => {
  scenario.revision = 17
  scenario.services = [{ id: 'source-1', type: 'netease', baseUrl: 'https://lyrics.example/api/', token: 'secret', useLyrics: true, useMusicInfo: false }]
  const { externalSourceCacheIdentity } = await import('../../src/lib/external-source-cache-key')
  const identity = externalSourceCacheIdentity(scenario.services)
  const cached = sheet('word', 'current cached lyrics')
  scenario.cached = { sheet: cached, sourceIdentity: identity, sourceRevision: 17, metadataParsed: true }

  const { loadLyricSheet } = await import('../../src/lib/lyric-offset')
  const provider = { lyrics: vi.fn() }
  await expect(loadLyricSheet(provider as any, 'server', 'track', { title: 'title' })).resolves.toBe(cached)
  expect(provider.lyrics).not.toHaveBeenCalled()
  expect(scenario.fetchExternalLyricSheet).not.toHaveBeenCalled()
})

it('prefers a fresh line lyric from the current source over stale cached word lyrics', async () => {
  scenario.revision = 8
  scenario.services = [{ id: 'new-source', type: 'lrcapi', baseUrl: 'https://new.example', useLyrics: true, useMusicInfo: false }]
  scenario.cached = { sheet: sheet('word', 'removed source'), sourceIdentity: 'old-source', sourceRevision: 7 }
  scenario.externalResult = sheet('line', 'current source')

  const { loadLyricSheet } = await import('../../src/lib/lyric-offset')
  const provider = { lyrics: vi.fn().mockResolvedValue(null) }
  const result = await loadLyricSheet(provider as any, 'server', 'track', { title: 'title' })
  expect(result).toMatchObject({ tier: 'line', source: 'current source' })
  expect(scenario.fetchExternalLyricSheet).toHaveBeenCalledOnce()
  expect(scenario.writeCachedLyric).toHaveBeenCalledWith('server', 'track', result, expect.objectContaining({
    sourceRevision: 8,
    sourceIdentity: expect.any(String),
  }))
})

it('returns the saved lyric as an offline fallback when current sources fail', async () => {
  scenario.revision = 3
  scenario.services = [{ id: 'current-source', type: 'netease', baseUrl: 'https://current.example', useLyrics: true, useMusicInfo: false }]
  const saved = sheet('word', 'saved offline lyric')
  scenario.cached = { sheet: saved, sourceIdentity: 'previous-source', sourceRevision: 2 }

  const { loadLyricSheet } = await import('../../src/lib/lyric-offset')
  const provider = { lyrics: vi.fn().mockRejectedValue(new Error('offline')) }
  await expect(loadLyricSheet(provider as any, 'server', 'track', { title: 'title' })).resolves.toBe(saved)
  expect(scenario.fetchExternalLyricSheet).toHaveBeenCalledOnce()
  expect(scenario.writeCachedLyric).not.toHaveBeenCalled()
})

it('rechecks a matching lower-tier cache against the current external source', async () => {
  scenario.revision = 9
  scenario.services = [{ id: 'source', type: 'lrcapi', baseUrl: 'https://lyrics.example', useLyrics: true, useMusicInfo: false }]
  const { externalSourceCacheIdentity } = await import('../../src/lib/external-source-cache-key')
  scenario.cached = {
    sheet: sheet('line', 'saved NAS lyric'),
    sourceIdentity: externalSourceCacheIdentity(scenario.services),
    sourceRevision: 9,
  }
  scenario.externalResult = sheet('word', 'current source')

  const { loadLyricSheet } = await import('../../src/lib/lyric-loader')
  await expect(loadLyricSheet({ lyrics: vi.fn().mockResolvedValue(null) } as any, 'server', 'track', { title: 'title' }))
    .resolves.toMatchObject({ tier: 'word', source: 'current source' })
  expect(scenario.fetchExternalLyricSheet).toHaveBeenCalledOnce()
})

it('treats an empty provider word sheet as missing and falls back to the external source', async () => {
  scenario.services = [{ id: 'source', type: 'lrcapi', baseUrl: 'https://lyrics.example', useLyrics: true, useMusicInfo: false }]
  scenario.externalResult = sheet('line', 'external fallback')
  const { loadLyricSheet } = await import('../../src/lib/lyric-loader')
  const result = await loadLyricSheet({ lyrics: vi.fn().mockResolvedValue({ ...sheet('word', 'empty'), lines: [] }) } as any, 'server', 'track', { title: 'title' })
  expect(result).toMatchObject({ tier: 'line', source: 'external fallback' })
  expect(scenario.fetchExternalLyricSheet).toHaveBeenCalledOnce()
})

it('does not let an old source response overwrite cache after configuration changes', async () => {
  let resolveExternal!: (value: any) => void
  scenario.services = [{ id: 'old', type: 'lrcapi', baseUrl: 'https://old.example', useLyrics: true, useMusicInfo: false }]
  scenario.fetchExternalLyricSheet.mockImplementation(() => new Promise((resolve) => { resolveExternal = resolve }))
  const { externalSourceCacheIdentity } = await import('../../src/lib/external-source-cache-key')
  const oldIdentity = externalSourceCacheIdentity(scenario.services)
  const { loadLyricSheet } = await import('../../src/lib/lyric-loader')
  const pending = loadLyricSheet({ lyrics: vi.fn().mockResolvedValue(null) } as any, 'server', 'track', { title: 'title' })
  await Promise.resolve()
  expect(scenario.fetchExternalLyricSheet).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ baseUrl: 'https://old.example' }),
    undefined,
  )

  scenario.revision = 2
  scenario.services = [{ id: 'new', type: 'lrcapi', baseUrl: 'https://new.example', useLyrics: true, useMusicInfo: false }]
  resolveExternal(sheet('line', 'old response'))
  await expect(pending).resolves.toMatchObject({ source: 'old response' })
  expect(scenario.writeCachedLyric).not.toHaveBeenCalled()
  expect(oldIdentity).not.toBe(externalSourceCacheIdentity(scenario.services))
})

it('does not write cache when the query is cancelled while its provider request is pending', async () => {
  let resolveProvider!: (value: any) => void
  const provider = { lyrics: vi.fn(() => new Promise((resolve) => { resolveProvider = resolve })) }
  const controller = new AbortController()
  const { loadLyricSheet } = await import('../../src/lib/lyric-loader')
  const pending = loadLyricSheet(provider as any, 'server', 'track', { title: 'title' }, undefined, undefined, controller.signal)
  controller.abort(new Error('cancelled by query client'))
  resolveProvider(sheet('line', 'late NAS lyric'))
  await expect(pending).rejects.toThrow('cancelled by query client')
  expect(scenario.writeCachedLyric).not.toHaveBeenCalled()
})

it('retries an external source after it previously returned no lyric', async () => {
  scenario.revision = 4
  scenario.services = [{ id: 'source', type: 'lrcapi', baseUrl: 'https://lyrics.example', useLyrics: true, useMusicInfo: false }]
  scenario.externalResult = null
  const { loadLyricSheet, lyricStaleTime } = await import('../../src/lib/lyric-loader')
  const provider = { lyrics: vi.fn().mockResolvedValue(null) }
  await expect(loadLyricSheet(provider as any, 'server', 'track', { title: 'title' })).resolves.toBeNull()
  await expect(loadLyricSheet(provider as any, 'server', 'track', { title: 'title' })).resolves.toBeNull()
  expect(scenario.fetchExternalLyricSheet).toHaveBeenCalledTimes(2)
  expect(lyricStaleTime(null)).toBe(0)
})


it('protects a foreground share joining prefetch from speculative cancellation', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  const { createLyricPrefetcher } = await import('../../src/lib/lyric-prefetch')
  const { fetchForegroundLyric, lyricQueryOptions } = await import('../../src/lib/lyric-loader')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  let resolve!: (value: any) => void
  let signal: AbortSignal | undefined
  const provider = { lyrics: vi.fn((_id: string, options?: { signal?: AbortSignal }) => {
    signal = options?.signal
    return new Promise<any>((done) => { resolve = done })
  }) }
  const prefetch = createLyricPrefetcher(client, provider as any, 'server')
  const item = { qid: 'q', serverId: 'server', trackId: 'track', title: 'title', artistText: 'artist', durationMs: 1000 }
  prefetch.update([item], true)
  const options = lyricQueryOptions(provider, 'server', 'track', { title: 'title', artist: 'artist' })
  const foreground = fetchForegroundLyric(client, options)
  prefetch.update([], false)
  expect(signal?.aborted).toBe(false)
  expect(provider.lyrics).toHaveBeenCalledOnce()
  const result = sheet('word', 'shared lyric')
  resolve(result)
  await expect(foreground).resolves.toBe(result)
  expect(client.getQueryCache().find({ queryKey: options.queryKey })?.getObserversCount()).toBe(0)
  prefetch.dispose()
  client.clear()
})

it('refreshes old word caches that dropped credits, preserving them when offline', async () => {
  const { externalSourceCacheIdentity } = await import('../../src/lib/external-source-cache-key')
  const old = sheet('word', 'old')
  scenario.cached = { sheet: old, sourceIdentity: externalSourceCacheIdentity([]), sourceRevision: 1 }
  const { loadLyricSheet } = await import('../../src/lib/lyric-loader')
  const fresh = sheet('word', 'credits restored')
  const provider = { lyrics: vi.fn().mockResolvedValueOnce(fresh).mockRejectedValueOnce(new Error('offline')) }
  await expect(loadLyricSheet(provider as any, 'server', 'track')).resolves.toBe(fresh)
  await expect(loadLyricSheet(provider as any, 'server', 'track')).resolves.toBe(old)
  expect(provider.lyrics).toHaveBeenCalledTimes(2)
})

it('falls back when a source supplies only credits', async () => {
  scenario.services = [{ id: 'source', type: 'lrcapi', baseUrl: 'https://lyrics.example', useLyrics: true, useMusicInfo: false }]
  scenario.externalResult = sheet('line', 'body')
  const { loadLyricSheet } = await import('../../src/lib/lyric-loader')
  const credits = { ...sheet('word', 'credits'), lines: [{ atMs: -99999, text: '作词：甲' }] }
  await expect(loadLyricSheet({ lyrics: vi.fn().mockResolvedValue(credits) } as any, 'server', 'track', { title: 'title' }))
    .resolves.toBe(scenario.externalResult)
})
