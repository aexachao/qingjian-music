import { AppState } from 'react-native'
import * as Network from 'expo-network'
import type { QueryClient } from '@tanstack/react-query'
import type { MusicProvider } from '@qj/provider-api'
import { createLyricPrefetcher, LYRIC_PREFETCH_AHEAD } from '@/lib/lyric-prefetch'
import { lyricQueryOptions } from '@/lib/lyric-loader'
import { useExternalSourcesStore } from '@/lib/external-source'
import { usePlaybackNetworkPreferences } from '@/lib/playback-network-preferences'
import { canUsePlaybackNetwork, refreshPlaybackConnection, updatePlaybackConnection } from './network-access'
import { getPlaybackIntent, subscribePlaybackIntent } from './playback-intent'
import { usePlayerStore } from './store'

function hasUsableLyrics(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('lines' in value) || !Array.isArray(value.lines)) return false
  return value.lines.some((line) => {
    if (!line || typeof line !== 'object' || !('text' in line) || typeof line.text !== 'string') return false
    return !('atMs' in line && typeof line.atMs === 'number' && line.atMs < 0) && line.text.trim().length > 0
  })
}

/** One queue-aware lyrics scheduler per authenticated provider, not per lyric page. */
export function startLyricPrefetch(provider: MusicProvider, serverId: string, client: QueryClient): () => void {
  const prefetch = createLyricPrefetcher(client, provider, serverId)
  let disposed = false
  let wasRecoveryEligible = false
  let previousRecoveryKey = ''
  const update = () => {
    if (disposed) return
    const { queue, index, pendingCurrent } = usePlayerStore.getState()
    const items = pendingCurrent ? [pendingCurrent] : index >= 0 ? queue.slice(index, index + LYRIC_PREFETCH_AHEAD + 1) : []
    const foreground = AppState.currentState === 'active'
    const networkAllowed = canUsePlaybackNetwork()
    const hydrated = useExternalSourcesStore.getState().hydrated
    const allowed = hydrated && foreground && getPlaybackIntent().wantsPlay && networkAllowed
    prefetch.update(items, allowed)

    // Prefetch remains play-intent gated. Recovery for the visible current song
    // is foreground work, so it also runs while paused after connectivity returns.
    const current = pendingCurrent ?? (index >= 0 ? queue[index] : undefined)
    const recoveryEligible = hydrated && foreground && networkAllowed
    if (current?.serverId === serverId && current.title.trim() && recoveryEligible) {
      const options = lyricQueryOptions(provider, serverId, current.trackId, {
        title: current.title, artist: current.artistText, album: current.albumText,
      })
      const recoveryKey = JSON.stringify(options.queryKey)
      const query = client.getQueryCache().find({ queryKey: options.queryKey, exact: true })
      const hasCachedLyrics = hasUsableLyrics(query?.state.data)
      const needsRecovery = query?.getObserversCount() && query.state.fetchStatus === 'idle'
        && !hasCachedLyrics && (query.state.status === 'error' || query.state.data === null)
      const currentChanged = recoveryKey !== previousRecoveryKey
      const recoveredEligibility = !wasRecoveryEligible
      if (needsRecovery && (currentChanged || recoveredEligibility)) {
        void client.fetchQuery(options).catch(() => undefined)
      }
      previousRecoveryKey = recoveryKey
    } else {
      previousRecoveryKey = ''
    }
    wasRecoveryEligible = recoveryEligible
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
