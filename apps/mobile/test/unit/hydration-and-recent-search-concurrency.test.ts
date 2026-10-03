import { beforeEach, describe, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({
  values: new Map<string, string>(),
  writes: [] as { key: string; value: string }[],
  getItem: undefined as undefined | ((key: string) => Promise<string | null>),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn((key: string) => io.getItem ? io.getItem(key) : Promise.resolve(io.values.get(key) ?? null)),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    io.writes.push({ key, value })
    io.values.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => { io.values.delete(key) }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function loadFavorites() {
  vi.resetModules()
  return import('../../src/lib/local-favorites')
}

async function loadQualityPreferences() {
  vi.resetModules()
  return import('../../src/lib/audio-quality-preferences')
}

async function loadCachePreferences() {
  vi.resetModules()
  return import('../../src/lib/cache-preferences')
}

async function loadExternalSources() {
  vi.resetModules()
  return import('../../src/lib/external-source')
}

async function loadRecentSearch() {
  vi.resetModules()
  return import('../../src/lib/recent-search')
}

describe('async local-state interleavings', () => {
  beforeEach(() => {
    io.values.clear()
    io.writes.length = 0
    io.getItem = undefined
    vi.resetModules()
  })

  it('replays new-server favorites over the old multi-server snapshot and preserves other categories', async () => {
    const read = deferred<string | null>()
    io.getItem = () => read.promise
    const { useLocalFavoritesStore } = await loadFavorites()
    useLocalFavoritesStore.getState().toggleAlbum('new-server', { id: 'new', name: 'New' })
    useLocalFavoritesStore.getState().togglePlaylist('new-server', { id: 'new-playlist', name: 'New playlist' })
    expect(io.writes).toHaveLength(0)

    read.resolve(JSON.stringify({
      albumsByServer: { 'old-server': [{ id: 'old', name: 'Old', savedAt: 1 }] },
      playlistsByServer: { 'old-server': [{ id: 'old-list', name: 'Old list', savedAt: 2 }] },
      artistsByServer: { 'old-server': [{ id: 'old-artist', name: 'Old artist', savedAt: 3 }] },
    }))
    await vi.waitFor(() => expect(useLocalFavoritesStore.getState().hydrated).toBe(true))
    const state = useLocalFavoritesStore.getState()
    expect(state.albumsByServer['old-server']).toHaveLength(1)
    expect(state.albumsByServer['new-server'].map((item) => item.id)).toEqual(['new'])
    expect(state.playlistsByServer['old-server'].map((item) => item.id)).toEqual(['old-list'])
    expect(state.playlistsByServer['new-server'].map((item) => item.id)).toEqual(['new-playlist'])
    expect(state.artistsByServer['old-server'].map((item) => item.id)).toEqual(['old-artist'])
    const saved = JSON.parse(io.values.get('qj.store.local_favorites.v1')!)
    expect(saved.albumsByServer['old-server']).toHaveLength(1)
    expect(saved.artistsByServer['old-server']).toHaveLength(1)
  })

  it('keeps loaded favorites when an optimistic startup tap selects an already-favorited item', async () => {
    const read = deferred<string | null>()
    io.getItem = () => read.promise
    const { useLocalFavoritesStore } = await loadFavorites()
    const store = useLocalFavoritesStore.getState()
    store.toggleAlbum('server', { id: 'album', name: 'Album' })
    store.togglePlaylist('server', { id: 'playlist', name: 'Playlist' })
    store.toggleArtist('server', { id: 'artist', name: 'Artist' })
    read.resolve(JSON.stringify({
      albumsByServer: { server: [{ id: 'album', name: 'Album', savedAt: 1 }] },
      playlistsByServer: { server: [{ id: 'playlist', name: 'Playlist', savedAt: 2 }] },
      artistsByServer: { server: [{ id: 'artist', name: 'Artist', savedAt: 3 }] },
    }))
    await vi.waitFor(() => expect(useLocalFavoritesStore.getState().hydrated).toBe(true))
    const state = useLocalFavoritesStore.getState()
    expect(state.albumsByServer.server).toHaveLength(1)
    expect(state.playlistsByServer.server).toHaveLength(1)
    expect(state.artistsByServer.server).toHaveLength(1)
  })

  it('keeps an audio-quality edit and restores untouched persisted preference fields', async () => {
    const read = deferred<string | null>()
    io.getItem = () => read.promise
    const { useAudioQualityPreferences } = await loadQualityPreferences()
    useAudioQualityPreferences.getState().setWifiQuality('standard')
    read.resolve(JSON.stringify({ wifiQuality: 'original', cellularQuality: 'standard', downloadQuality: 'standard' }))
    await vi.waitFor(() => expect(useAudioQualityPreferences.getState().cellularQuality).toBe('standard'))
    expect(useAudioQualityPreferences.getState()).toMatchObject({
      wifiQuality: 'standard', cellularQuality: 'standard', downloadQuality: 'standard',
    })
    expect(JSON.parse(io.values.get('qj.prefs.audio_quality')!)).toEqual({
      wifiQuality: 'standard', cellularQuality: 'standard', downloadQuality: 'standard',
    })
  })

  it('keeps untouched cache preference fields when a size edit races hydration', async () => {
    const read = deferred<string | null>()
    io.getItem = () => read.promise
    const { useCachePreferences } = await loadCachePreferences()
    useCachePreferences.getState().setSizeLimitKey('5GB')
    read.resolve(JSON.stringify({ autoCacheEnabled: false, sizeLimitKey: '2GB', countLimitKey: '300' }))
    await vi.waitFor(() => expect(useCachePreferences.getState().autoCacheEnabled).toBe(false))
    expect(useCachePreferences.getState()).toMatchObject({
      autoCacheEnabled: false, sizeLimitKey: '5GB', countLimitKey: '300',
    })
    expect(JSON.parse(io.values.get('qj.prefs.cache')!)).toMatchObject({
      autoCacheEnabled: false, sizeLimitKey: '5GB', countLimitKey: '300',
    })
  })

  it('replays external-source edits over the loaded services and advances the public revision', async () => {
    const read = deferred<string | null>()
    io.getItem = () => read.promise
    const { useExternalSourcesStore } = await loadExternalSources()
    useExternalSourcesStore.getState().addService('lrcapi', {
      id: 'new-service', baseUrl: 'https://new.example', useLyrics: true, useMusicInfo: false,
    })
    const editedRevision = useExternalSourcesStore.getState().revision
    useExternalSourcesStore.getState().updateService('old-service', { token: 'edited-secret' })
    read.resolve(JSON.stringify({ revision: 8, services: [{
      id: 'old-service', type: 'netease', baseUrl: 'https://old.example', token: 'secret',
      useLyrics: true, useMusicInfo: true,
    }] }))
    await vi.waitFor(() => expect(useExternalSourcesStore.getState().hydrated).toBe(true))
    const state = useExternalSourcesStore.getState()
    expect(state.revision).toBe(10)
    expect(state.revision).toBeGreaterThan(editedRevision)
    expect(state.services.map((service) => service.id)).toEqual(['old-service', 'new-service'])
    expect(state.services[0]?.token).toBe('edited-secret')
    await vi.waitFor(() => expect(JSON.parse(io.values.get('qj.store.external_sources.v1')!).revision).toBe(10))

    io.getItem = undefined
    const { useExternalSourcesStore: reloadedStore } = await loadExternalSources()
    await vi.waitFor(() => expect(reloadedStore.getState().hydrated).toBe(true))
    expect(reloadedStore.getState().revision).toBe(10)
  })

  it('migrates legacy external-source data and writes the initial durable revision', async () => {
    io.values.set('qj.store.external_sources.v1', JSON.stringify({
      lyrics: { type: 'lrcapi', baseUrl: 'https://lyrics.example', token: 'legacy-secret' },
      musicInfo: { type: 'netease', baseUrl: 'https://music.example', token: 'info-secret' },
    }))
    const { useExternalSourcesStore } = await loadExternalSources()
    await vi.waitFor(() => expect(useExternalSourcesStore.getState().hydrated).toBe(true))
    expect(useExternalSourcesStore.getState().services).toHaveLength(2)
    await vi.waitFor(() => expect(JSON.parse(io.values.get('qj.store.external_sources.v1')!).revision).toBe(0))
  })

  it('does not write defaults after a read failure and retries before persisting a queued mutation', async () => {
    let calls = 0
    const retryRead = deferred<string | null>()
    io.getItem = async () => {
      calls += 1
      if (calls === 1) throw new Error('secure store unavailable')
      return retryRead.promise
    }
    const { useLocalFavoritesStore } = await loadFavorites()
    await vi.waitFor(() => expect(calls).toBe(1))
    await Promise.resolve()
    useLocalFavoritesStore.getState().toggleAlbum('server', { id: 'new', name: 'New' })
    await vi.waitFor(() => expect(calls).toBe(2))
    expect(io.writes).toHaveLength(0)
    retryRead.resolve(JSON.stringify({
      albumsByServer: { 'old-server': [{ id: 'old', name: 'Old', savedAt: 1 }] },
      playlistsByServer: {}, artistsByServer: {},
    }))
    await vi.waitFor(() => expect(useLocalFavoritesStore.getState().hydrated).toBe(true))
    expect(useLocalFavoritesStore.getState().albumsByServer['old-server']).toHaveLength(1)
    expect(JSON.parse(io.values.get('qj.store.local_favorites.v1')!).albumsByServer.server).toHaveLength(1)
  })

  it('serializes concurrent search pushes and clear/remove operations as full transactions', async () => {
    const firstRead = deferred<string | null>()
    let readCount = 0
    io.getItem = async (key) => {
      readCount += 1
      if (readCount === 1) return firstRead.promise
      return io.values.get(key) ?? null
    }
    const { pushRecentSearch, removeRecentSearch, clearRecentSearches, listRecentSearches } = await loadRecentSearch()
    const concurrent = Promise.all([pushRecentSearch('first'), pushRecentSearch('second')])
    firstRead.resolve('[]')
    await concurrent
    expect(await listRecentSearches()).toEqual(['second', 'first'])
    await Promise.all([pushRecentSearch('remove-me'), pushRecentSearch('keep-me')])
    await removeRecentSearch('remove-me')
    expect(await listRecentSearches()).toEqual(['keep-me', 'second', 'first'])
    await Promise.all([pushRecentSearch('before-clear'), clearRecentSearches(), pushRecentSearch('after-clear')])
    expect(await listRecentSearches()).toEqual(['after-clear'])
  })

  it('does not let an older native icon response win after a newer intent', async () => {
    const firstSet = deferred<void>()
    const native = { current: 'crimson-note', calls: [] as string[] }
    const { createLatestAsyncIntentQueue } = await import('../../src/lib/hydration-queue')
    const intents = createLatestAsyncIntentQueue()
    const firstIntent = intents.begin()
    const first = intents.run(firstIntent, async () => {
      native.calls.push('white-note')
      await firstSet.promise
      native.current = 'white-note'
    })
    await vi.waitFor(() => expect(native.calls).toEqual(['white-note']))
    const secondIntent = intents.begin()
    const second = intents.run(secondIntent, async () => {
      native.calls.push('dark-note')
      native.current = 'dark-note'
    })
    firstSet.resolve()
    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(true)
    expect(native.current).toBe('dark-note')
    expect(native.calls).toEqual(['white-note', 'dark-note'])
  })
})
