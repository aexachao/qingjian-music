import * as Network from 'expo-network'
import { hydratePlaybackNetworkPreferences, usePlaybackNetworkPreferences } from '@/lib/playback-network-preferences'

export type PlaybackConnection = 'wifi' | 'cellular' | 'offline' | 'unknown'
const NETWORK_STATE_TIMEOUT_MS = 6000
let connection: PlaybackConnection = 'unknown'
let revision = 0
let refresh: Promise<PlaybackConnection> | undefined
const connectionListeners = new Set<(connection: PlaybackConnection) => void>()

export function classifyPlaybackConnection(state: Network.NetworkState): PlaybackConnection {
  // A private NAS may be reachable on Wi-Fi without access to the public internet.
  if (state.isConnected === false || state.type === Network.NetworkStateType.NONE) return 'offline'
  if (state.type === Network.NetworkStateType.WIFI || state.type === Network.NetworkStateType.ETHERNET) return 'wifi'
  if (state.type === Network.NetworkStateType.CELLULAR) return 'cellular'
  return 'unknown'
}
export function getPlaybackConnection(): PlaybackConnection { return connection }
export function updatePlaybackConnection(state: Network.NetworkState): PlaybackConnection {
  revision += 1
  connection = classifyPlaybackConnection(state)
  for (const listener of connectionListeners) listener(connection)
  return connection
}

/**
 * Start observing before the audio engine is ready. On iOS the one-shot Expo
 * network read can wait up to five seconds, while NWPathMonitor normally emits
 * the usable interface much sooner.
 */
export function startPlaybackConnectionMonitor(): () => void {
  const subscription = Network.addNetworkStateListener(updatePlaybackConnection)
  void refreshPlaybackConnection()
  return () => subscription.remove()
}

export function refreshPlaybackConnection(): Promise<PlaybackConnection> {
  if (refresh) return refresh
  const captured = revision
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let settle: ((connection: PlaybackConnection) => void) | undefined
  const onConnection = (next: PlaybackConnection) => {
    if (!active || next === 'unknown') return
    active = false
    settle?.(next)
  }
  connectionListeners.add(onConnection)
  const pending = new Promise<PlaybackConnection>((resolve) => {
    settle = resolve
    timer = setTimeout(() => {
      active = false
      resolve(connection)
    }, NETWORK_STATE_TIMEOUT_MS)

    void Promise.resolve().then(() => Network.getNetworkStateAsync()).then((state) => {
      if (!active) return
      // A useful newer notification wins over this snapshot. An unknown event
      // must not prevent a later concrete snapshot from completing startup.
      if (captured === revision || connection === 'unknown') updatePlaybackConnection(state)
      onConnection(connection)
    }).catch(() => {
      if (!active) return
      active = false
      resolve(connection)
    })
  })
  refresh = pending.finally(() => {
    active = false
    connectionListeners.delete(onConnection)
    if (timer !== undefined) clearTimeout(timer)
    refresh = undefined
  })
  return refresh
}
export function canUsePlaybackNetwork(): boolean {
  if (connection === 'offline') return false
  if (connection === 'wifi') return true
  // When Wi-Fi-only is off, interface classification is not needed to allow a
  // request. The server/native player will report a real transport failure if
  // the connection is unusable. Blocking UNKNOWN here makes VPN interfaces and
  // a slow first NWPath callback look like a permanent playback failure.
  return usePlaybackNetworkPreferences.getState().allowCellularPlayback
}
export class PlaybackNetworkBlocked extends Error {
  constructor(public readonly connection: PlaybackConnection) {
    super(connection === 'cellular'
      ? '已开启“仅 Wi-Fi 联网”，可在设置中关闭；已下载的歌曲仍可播放'
      : connection === 'offline' ? '网络已断开，请连接网络后重试' : '暂时无法确认网络类型，请稍后重试')
    this.name = 'PlaybackNetworkBlocked'
  }
}
export async function requirePlaybackNetwork(): Promise<void> {
  await hydratePlaybackNetworkPreferences()
  if (connection === 'unknown' && !usePlaybackNetworkPreferences.getState().allowCellularPlayback) {
    await refreshPlaybackConnection()
  }
  if (!canUsePlaybackNetwork()) throw new PlaybackNetworkBlocked(connection)
}
