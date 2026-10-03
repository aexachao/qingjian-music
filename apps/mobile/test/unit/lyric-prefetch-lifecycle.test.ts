import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import type { MusicProvider } from '@qj/provider-api'
const h = vi.hoisted(() => {
  const listeners = () => new Set<() => void>()
  return {
    player: { queue: [] as any[], index: -1, pendingCurrent: undefined as any },
    sources: { hydrated: true }, intent: { wantsPlay: true }, allowed: true,
    app: { currentState: 'active' }, update: vi.fn(), dispose: vi.fn(),
    queueListeners: listeners(), sourceListeners: listeners(), intentListeners: listeners(), policyListeners: listeners(), appListeners: listeners(), networkListeners: listeners(),
  }
})
function subscribe(set: Set<() => void>, fn: () => void) { set.add(fn); return () => set.delete(fn) }
vi.mock('react-native', () => ({ AppState: { get currentState() { return h.app.currentState }, addEventListener: (_type: string, fn: () => void) => ({ remove: subscribe(h.appListeners, fn) }) } }))
vi.mock('expo-network', () => ({ addNetworkStateListener: (fn: () => void) => ({ remove: subscribe(h.networkListeners, fn) }) }))
vi.mock('../../src/lib/lyric-prefetch', () => ({ LYRIC_PREFETCH_AHEAD: 10, createLyricPrefetcher: () => ({ update: h.update, dispose: h.dispose }) }))
vi.mock('../../src/lib/external-source', () => ({ useExternalSourcesStore: { getState: () => h.sources, subscribe: (fn: () => void) => subscribe(h.sourceListeners, fn) } }))
vi.mock('../../src/lib/playback-network-preferences', () => ({ usePlaybackNetworkPreferences: { subscribe: (fn: () => void) => subscribe(h.policyListeners, fn) } }))
vi.mock('../../src/player/store', () => ({ usePlayerStore: { getState: () => h.player, subscribe: (fn: () => void) => subscribe(h.queueListeners, fn) } }))
vi.mock('../../src/player/playback-intent', () => ({ getPlaybackIntent: () => h.intent, subscribePlaybackIntent: (fn: () => void) => subscribe(h.intentListeners, fn) }))
vi.mock('../../src/player/network-access', () => ({ canUsePlaybackNetwork: () => h.allowed, updatePlaybackConnection: vi.fn(), refreshPlaybackConnection: async () => undefined }))
import { startLyricPrefetch } from '../../src/player/lyric-prefetch'
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
const emit = (listeners: Set<() => void>) => { for (const fn of listeners) fn() }
let stop: () => void
beforeEach(() => {
  h.player = { queue: Array.from({ length: 30 }, (_, i) => ({ qid: `q${i}` })), index: 2, pendingCurrent: undefined }
  h.sources.hydrated = true; h.intent.wantsPlay = true; h.allowed = true; h.app.currentState = 'active'
  h.update.mockClear(); h.dispose.mockClear()
  stop = startLyricPrefetch({} as MusicProvider, 's', {} as QueryClient)
})
afterEach(() => stop())
it('batches queue writes and starts the final current-plus-ten window', async () => {
  await flush(); h.update.mockClear()
  h.player.index = 4; emit(h.queueListeners)
  h.player.index = 8; emit(h.queueListeners)
  await flush()
  expect(h.update).toHaveBeenLastCalledWith(h.player.queue.slice(8, 19), true)
  expect(h.update.mock.calls.every(([items]) => items[0]?.qid === 'q8')).toBe(true)
})
it('source changes and pending track selection update without a new native playback event', async () => {
  await flush(); h.update.mockClear()
  emit(h.sourceListeners)
  await flush()
  expect(h.update).toHaveBeenCalledOnce()
  h.player.pendingCurrent = { qid: 'new-loading-target' }
  emit(h.queueListeners)
  await flush()
  expect(h.update).toHaveBeenLastCalledWith([h.player.pendingCurrent], true)
})
it('pausing, background, policy denial and pending source hydration suppress speculation', async () => {
  await flush()
  h.intent.wantsPlay = false; emit(h.intentListeners); await flush()
  expect(h.update.mock.lastCall?.[1]).toBe(false)
  h.intent.wantsPlay = true; h.app.currentState = 'background'; emit(h.appListeners); await flush()
  expect(h.update.mock.lastCall?.[1]).toBe(false)
  h.app.currentState = 'active'; h.allowed = false; emit(h.networkListeners); await flush()
  expect(h.update.mock.lastCall?.[1]).toBe(false)
  h.allowed = true; h.sources.hydrated = false; emit(h.sourceListeners); await flush()
  expect(h.update.mock.lastCall?.[1]).toBe(false)
  h.sources.hydrated = true; emit(h.sourceListeners); await flush()
  expect(h.update.mock.lastCall?.[1]).toBe(true)
})
it('logout disposal unsubscribes and ignores an already queued refresh', async () => {
  await flush(); h.update.mockClear()
  emit(h.queueListeners)
  stop(); stop = () => undefined
  await flush()
  expect(h.dispose).toHaveBeenCalledOnce()
  expect(h.update).not.toHaveBeenCalled()
  for (const set of [h.queueListeners, h.sourceListeners, h.intentListeners, h.policyListeners, h.appListeners, h.networkListeners]) expect(set.size).toBe(0)
})
