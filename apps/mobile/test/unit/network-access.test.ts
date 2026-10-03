import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
  type NetworkState = { type: string; isConnected?: boolean; isInternetReachable?: boolean }
  let state: NetworkState = { type: 'wifi', isConnected: true }
  let read: (() => Promise<NetworkState>) | undefined
  const listeners = new Set<(state: NetworkState) => void>()
  let preferenceState = { allowCellularPlayback: false }

  return {
    NetworkStateType: {
      NONE: 'none',
      WIFI: 'wifi',
      ETHERNET: 'ethernet',
      CELLULAR: 'cellular',
      UNKNOWN: 'unknown',
    },
    Network: {
      getNetworkStateAsync: vi.fn(async () => (read ? read() : state)),
      addNetworkStateListener: vi.fn((listener: (state: NetworkState) => void) => {
        listeners.add(listener)
        return { remove: vi.fn(() => listeners.delete(listener)) }
      }),
      setState(next: NetworkState) { state = next },
      setRead(next: (() => Promise<NetworkState>) | undefined) { read = next },
      emit(next: NetworkState) {
        state = next
        for (const listener of listeners) listener(next)
      },
    },
    Preferences: {
      usePlaybackNetworkPreferences: {
        getState: () => preferenceState,
      },
      hydratePlaybackNetworkPreferences: vi.fn(async () => true),
      setAllowCellular(value: boolean) { preferenceState = { allowCellularPlayback: value } },
    },
  }
})

vi.mock('expo-network', () => ({
  ...harness.Network,
  NetworkStateType: harness.NetworkStateType,
}))
vi.mock('@/lib/playback-network-preferences', () => harness.Preferences)

const {
  canUsePlaybackNetwork,
  classifyPlaybackConnection,
  getPlaybackConnection,
  refreshPlaybackConnection,
  requirePlaybackNetwork,
  startPlaybackConnectionMonitor,
  updatePlaybackConnection,
} = await import('../../src/player/network-access')

async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

function update(state: { type: string; isConnected?: boolean; isInternetReachable?: boolean }): void {
  updatePlaybackConnection(state as Parameters<typeof updatePlaybackConnection>[0])
}

beforeEach(() => {
  vi.useFakeTimers()
  harness.Network.getNetworkStateAsync.mockClear()
  harness.Network.setRead(undefined)
  harness.Network.setState({ type: harness.NetworkStateType.UNKNOWN, isConnected: true })
  harness.Preferences.setAllowCellular(false)
  update({ type: harness.NetworkStateType.UNKNOWN, isConnected: true })
})

describe('播放网络策略', () => {
  it('Wi-Fi 即使 isInternetReachable 为 false 仍允许访问局域网媒体', () => {
    const state = {
      type: harness.NetworkStateType.WIFI,
      isConnected: true,
      isInternetReachable: false,
    }
    expect(classifyPlaybackConnection(state as Parameters<typeof classifyPlaybackConnection>[0])).toBe('wifi')
    update(state)
    expect(getPlaybackConnection()).toBe('wifi')
    expect(canUsePlaybackNetwork()).toBe(true)
  })

  it('蜂窝网络受持久化开关控制', () => {
    update({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    expect(canUsePlaybackNetwork()).toBe(false)
    harness.Preferences.setAllowCellular(true)
    expect(canUsePlaybackNetwork()).toBe(true)
    harness.Preferences.setAllowCellular(false)
    expect(canUsePlaybackNetwork()).toBe(false)
  })

  it('类型未知时，关闭仅 Wi-Fi 联网仍允许尝试播放，开启后才拦截', () => {
    update({ type: harness.NetworkStateType.UNKNOWN, isConnected: true })
    harness.Preferences.setAllowCellular(true)
    expect(classifyPlaybackConnection({ type: harness.NetworkStateType.UNKNOWN, isConnected: true } as Parameters<typeof classifyPlaybackConnection>[0])).toBe('unknown')
    expect(getPlaybackConnection()).toBe('unknown')
    expect(canUsePlaybackNetwork()).toBe(true)
    harness.Preferences.setAllowCellular(false)
    expect(canUsePlaybackNetwork()).toBe(false)
  })

  it('关闭仅 Wi-Fi 联网时，首次漫游不等待网络类型查询', async () => {
    harness.Preferences.setAllowCellular(true)
    harness.Network.setRead(() => new Promise(() => undefined))

    await expect(requirePlaybackNetwork()).resolves.toBeUndefined()
    expect(harness.Network.getNetworkStateAsync).not.toHaveBeenCalled()
  })

  it('开启仅 Wi-Fi 联网时，类型未知仍等待可判断的网络事件', async () => {
    harness.Network.setRead(() => new Promise(() => undefined))
    const pending = requirePlaybackNetwork()
    await flush()
    update({ type: harness.NetworkStateType.WIFI, isConnected: true })

    await expect(pending).resolves.toBeUndefined()
  })

  it('明确断网时，即使允许蜂窝播放也拒绝在线播放', async () => {
    harness.Preferences.setAllowCellular(true)
    update({ type: harness.NetworkStateType.NONE, isConnected: false })

    await expect(requirePlaybackNetwork()).rejects.toThrow('网络已断开')
  })

  it('挂起的 native 查询最多等待 6 秒并返回当前连接', async () => {
    let resolveRead!: (state: { type: string; isConnected: boolean }) => void
    harness.Network.setRead(() => new Promise((resolve) => { resolveRead = resolve }))
    const pending = refreshPlaybackConnection()
    let settled = false
    void pending.then(() => { settled = true })

    await vi.advanceTimersByTimeAsync(5999)
    await flush()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    await expect(pending).resolves.toBe('unknown')

    // Resolve the native request after the timeout to avoid leaving a dangling promise.
    resolveRead({ type: harness.NetworkStateType.WIFI, isConnected: true })
    await flush()
  })

  it('超时后的晚到快照不会覆盖当前连接', async () => {
    let resolveRead!: (state: { type: string; isConnected: boolean }) => void
    harness.Network.setRead(() => new Promise((resolve) => { resolveRead = resolve }))
    const pending = refreshPlaybackConnection()
    await vi.advanceTimersByTimeAsync(6000)
    await flush()
    await expect(pending).resolves.toBe('unknown')

    update({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    resolveRead({ type: harness.NetworkStateType.WIFI, isConnected: true })
    await flush()
    expect(getPlaybackConnection()).toBe('cellular')
  })

  it('较新的网络事件不会被旧查询结果覆盖', async () => {
    let resolveRead!: (state: { type: string; isConnected: boolean }) => void
    harness.Network.setRead(() => new Promise((resolve) => { resolveRead = resolve }))
    const pending = refreshPlaybackConnection()
    await flush()
    update({ type: harness.NetworkStateType.WIFI, isConnected: true })
    resolveRead({ type: harness.NetworkStateType.CELLULAR, isConnected: true })

    await expect(pending).resolves.toBe('wifi')
    expect(getPlaybackConnection()).toBe('wifi')
  })

  it('播放器尚未初始化时，监听结果会立即完成首次网络判断', async () => {
    let resolveRead!: (state: { type: string; isConnected: boolean }) => void
    harness.Network.setRead(() => new Promise((resolve) => { resolveRead = resolve }))
    const stop = startPlaybackConnectionMonitor()
    const pending = refreshPlaybackConnection()
    await flush()

    harness.Network.emit({ type: harness.NetworkStateType.WIFI, isConnected: true })

    await expect(pending).resolves.toBe('wifi')
    expect(getPlaybackConnection()).toBe('wifi')
    stop()
    resolveRead({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()
  })

  it('unknown 监听事件不会抢先结束，随后到达的具体快照可以完成判断', async () => {
    let resolveRead!: (state: { type: string; isConnected: boolean }) => void
    harness.Network.setRead(() => new Promise((resolve) => { resolveRead = resolve }))
    const pending = refreshPlaybackConnection()
    await flush()
    update({ type: harness.NetworkStateType.UNKNOWN, isConnected: true })
    resolveRead({ type: harness.NetworkStateType.CELLULAR, isConnected: true })

    await expect(pending).resolves.toBe('cellular')
    expect(getPlaybackConnection()).toBe('cellular')
  })
})
