import { AppState } from 'react-native'
import * as Network from 'expo-network'
import type { QueryClient } from '@tanstack/react-query'
import type { MusicProvider } from '@qj/provider-api'
import { createLyricPrefetcher, LYRIC_PREFETCH_AHEAD } from '@/lib/lyric-prefetch'
import { useExternalSourcesStore } from '@/lib/external-source'
import { usePlaybackNetworkPreferences } from '@/lib/playback-network-preferences'
import { canUsePlaybackNetwork, refreshPlaybackConnection, updatePlaybackConnection } from './network-access'
import { getPlaybackIntent, subscribePlaybackIntent } from './playback-intent'
import { usePlayerStore } from './store'

/** One queue-aware lyrics scheduler per authenticated provider, not per lyric page. */
export function startLyricPrefetch(provider: MusicProvider, serverId: string, client: QueryClient): () => void {
  const prefetch = createLyricPrefetcher(client, provider, serverId)
  let disposed = false
  const update = () => {
    if (disposed) return
    const { queue, index, pendingCurrent } = usePlayerStore.getState()
    const items = pendingCurrent ? [pendingCurrent] : index >= 0 ? queue.slice(index, index + LYRIC_PREFETCH_AHEAD + 1) : []
    const allowed = useExternalSourcesStore.getState().hydrated
      && AppState.currentState === 'active' && getPlaybackIntent().wantsPlay && canUsePlaybackNetwork()
    prefetch.update(items, allowed)
  }
  // Queue/intent/pending-current are committed in several synchronous writes.
  // Observe their final state once, avoiding requests for a transient old queue.
  let queued = false
  const schedule = () => {
    if (queued || disposed) return
    queued = true
    void Promise.resolve().then(() => { queued = false; update() })
  }
  const unsubscribeQueue = usePlayerStore.subscribe(schedule)
  const unsubscribeSources = useExternalSourcesStore.subscribe(schedule)
  const unsubscribeIntent = subscribePlaybackIntent(schedule)
  const unsubscribePolicy = usePlaybackNetworkPreferences.subscribe(schedule)
  const appSub = AppState.addEventListener('change', schedule)
  const networkSub = Network.addNetworkStateListener((state) => {
    updatePlaybackConnection(state)
    schedule()
  })
  schedule()
  void refreshPlaybackConnection().then(schedule)
  return () => {
    disposed = true
    unsubscribeQueue(); unsubscribeSources(); unsubscribeIntent(); unsubscribePolicy()
    appSub.remove(); networkSub.remove()
    prefetch.dispose()
  }
}
