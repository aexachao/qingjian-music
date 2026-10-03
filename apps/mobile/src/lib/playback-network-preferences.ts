import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { createHydrationQueue } from './hydration-queue'
import { StorageMutationQueue } from './storage-mutation-queue'

// The old key stored an opt-in cellular switch that defaulted off. Reusing its
// value would turn the new Wi-Fi-only switch on for existing users even though
// this switch defaults off. A new key gives the changed setting clean semantics.
const KEY_PLAYBACK_NETWORK_PREFS = 'qj.prefs.wifi_only'

interface PlaybackNetworkPreferencesData {
  allowCellularPlayback: boolean
}

interface PlaybackNetworkPreferencesState extends PlaybackNetworkPreferencesData {
  hydrated: boolean
  setAllowCellularPlayback: (allowCellularPlayback: boolean) => void
}

const storageWrites = new StorageMutationQueue()
const hydration = createHydrationQueue<PlaybackNetworkPreferencesData>()

async function persist(state: PlaybackNetworkPreferencesData): Promise<void> {
  try {
    await storageWrites.run(() =>
      SecureStore.setItemAsync(
        KEY_PLAYBACK_NETWORK_PREFS,
        JSON.stringify({ wifiOnly: !state.allowCellularPlayback }),
      ),
    )
  } catch {
    // Keep the in-memory preference when SecureStore cannot be written.
  }
}

export const usePlaybackNetworkPreferences = create<PlaybackNetworkPreferencesState>((set, get) => ({
  // The user-facing “仅 Wi-Fi 联网” switch defaults to off, so fresh installs
  // may use cellular playback until the user explicitly enables Wi-Fi-only mode.
  allowCellularPlayback: true,
  hydrated: false,
  setAllowCellularPlayback: (allowCellularPlayback) => {
    hydration.queue((data) => ({ ...data, allowCellularPlayback }))
    set({ allowCellularPlayback })
    if (hydration.hydrated) void persist(get())
    else void hydratePlaybackNetworkPreferences()
  },
}))

/**
 * Reads the persisted playback network preference and replays any changes made
 * while SecureStore was loading. Read errors leave the fresh-install default in
 * memory and do not write it over the saved value.
 */
export function hydratePlaybackNetworkPreferences(): Promise<boolean> {
  return hydration.hydrate(async () => {
    const raw = await SecureStore.getItemAsync(KEY_PLAYBACK_NETWORK_PREFS)
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return {
      allowCellularPlayback: typeof data.wifiOnly === 'boolean' ? !data.wifiOnly : true,
    }
  }, (data, replayed) => {
    usePlaybackNetworkPreferences.setState({ ...data, hydrated: true })
    if (replayed) void persist(data)
  })
}

// Restore the setting during app startup while retaining the explicit API for
// callers that need to await completion before making a playback decision.
void hydratePlaybackNetworkPreferences()
