import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const scenario = vi.hoisted(() => ({
  provider: { lyrics: vi.fn() },
  externalResult: null as any,
  fetchExternalLyricSheet: vi.fn(),
  latest: undefined as any,
}))

vi.mock('../../src/lib/lyric-cache', () => ({
  captureLyricCacheGeneration: () => 1,
  readCachedLyric: () => null,
  writeCachedLyric: vi.fn(),
}))

vi.mock('../../src/lib/external-lyrics', () => ({
  fetchExternalLyricSheet: (...args: any[]) => scenario.fetchExternalLyricSheet(...args),
}))

vi.mock('../../src/lib/external-source', async () => {
  const { create: createStore } = await import('zustand')
  const useExternalSourcesStore = createStore<any>((set) => ({
    revision: 1,
    services: [],
    addService: (service: any) => set((state: any) => ({
      services: [...state.services, service],
      revision: state.revision + 1,
    })),
  }))
  return {
    useExternalSourcesStore,
    getLyricsSource: () => {
      const service = useExternalSourcesStore.getState().services.find((candidate: any) => candidate.useLyrics && candidate.baseUrl.trim())
      return service
        ? { type: service.type, baseUrl: service.baseUrl, token: service.token }
        : { type: 'none', baseUrl: '' }
    },
  }
})

vi.mock('../../src/lib/server-session', () => ({
  useServerSession: () => ({ provider: scenario.provider, connection: { id: 'server' } }),
}))

vi.mock('../../src/player/store', async () => {
  const { create: createStore } = await import('zustand')
  const usePlayerStore = createStore(() => ({
    current: { trackId: 'track', title: 'Song', artistText: 'Artist', albumText: 'Album' },
  }))
  return { usePlayerStore, selectCurrent: (state: any) => state.current }
})

import { useLyricSheet } from '../../src/lib/lyric-offset'
import { useExternalSourcesStore } from '../../src/lib/external-source'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let renderer: ReactTestRenderer | undefined

function Probe() {
  scenario.latest = useLyricSheet('track').data
  return null
}

beforeEach(() => {
  scenario.provider.lyrics.mockReset().mockResolvedValue(null)
  scenario.externalResult = null
  scenario.fetchExternalLyricSheet.mockReset().mockImplementation(() => Promise.resolve(scenario.externalResult))
  scenario.latest = undefined
  useExternalSourcesStore.setState({ revision: 1, services: [] })
})

afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount() })
  renderer = undefined
})

it('reloads the current track when a newly configured source changes the key from a null result', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    renderer = create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
  })
  await vi.waitFor(() => expect(scenario.latest).toBeNull())

  const external = { tier: 'word', source: 'new source', synced: true, offsetMs: 0, lines: [{ atMs: 0, text: 'fresh lyric' }] }
  scenario.externalResult = external
  await act(async () => {
    ;(useExternalSourcesStore.getState() as any).addService({
      id: 'new-source', type: 'lrcapi', baseUrl: 'https://lyrics.example', useLyrics: true, useMusicInfo: false,
    })
  })

  await vi.waitFor(() => expect(scenario.latest).toMatchObject({ source: 'new source' }))
  expect(scenario.fetchExternalLyricSheet).toHaveBeenCalledOnce()
})
