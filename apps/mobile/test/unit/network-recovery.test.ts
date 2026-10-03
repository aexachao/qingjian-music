import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueItem } from '@qj/core-domain'

const harness = vi.hoisted(() => {
  type Listener = (payload: any) => void
  type NetworkState = { type: string; isConnected?: boolean }

  const trackListeners = new Map<string, Set<Listener>>()
  const networkListeners = new Set<(state: NetworkState) => void>()
  const appListeners = new Set<(state: string) => void>()
  let activeTrack: { id: string; url: string } = { id: 'q1', url: 'https://example.test/q1' }
  let playbackState = 'paused'
  let progress = 72
  let networkState: NetworkState = { type: 'wifi', isConnected: true }
  let refreshPromise: Promise<NetworkState> | undefined
  let preferenceState = { allowCellularPlayback: false }
  const preferenceListeners = new Set<(state: typeof preferenceState) => void>()

  const emitTrack = (event: string, payload: unknown) => {
    for (const listener of trackListeners.get(event) ?? []) listener(payload)
  }
  const emitNetwork = (state: NetworkState) => {
    networkState = state
    for (const listener of networkListeners) listener(state)
  }
  const emitAppState = (state: string) => {
    for (const listener of appListeners) listener(state)
  }
  const setPreference = (allowCellularPlayback: boolean) => {
    preferenceState = { allowCellularPlayback }
    for (const listener of preferenceListeners) listener(preferenceState)
  }
  const setRefreshPromise = (promise: Promise<NetworkState> | undefined) => {
    refreshPromise = promise
  }

  const rntp = {
    getActiveTrack: vi.fn(async () => activeTrack),
    getPlaybackState: vi.fn(async () => ({ state: playbackState })),
    getProgress: vi.fn(async () => ({ position: progress })),
    stop: vi.fn(async () => { progress = 0; playbackState = 'stopped' }),
    addEventListener: vi.fn((event: string, listener: Listener) => {
      const listeners = trackListeners.get(event) ?? new Set<Listener>()
      listeners.add(listener)
      trackListeners.set(event, listeners)
      return { remove: vi.fn(() => listeners.delete(listener)) }
    }),
  }

  const recoverSuccessfully = async (): Promise<boolean> => {
    playbackState = 'playing'
    emitTrack('playback-state', { state: 'playing' })
    return true
  }
  const controller = {
    recoverPlaybackAfterNetwork: vi.fn(recoverSuccessfully),
    schedulePrefetch: vi.fn(),
    stopPlaybackForNetwork: vi.fn(async (_qid: string, _revision: number, stillCurrent: () => boolean) => {
      if (stillCurrent()) await rntp.stop()
    }),
    suspendPlaybackNetworkWork: vi.fn(),
  }
  const setup = {
    applyPlaybackNetworkOptions: vi.fn(async () => undefined),
  }
  const notify = vi.fn()

  const reset = () => {
    trackListeners.clear()
    networkListeners.clear()
    appListeners.clear()
    preferenceListeners.clear()
    activeTrack = { id: 'q1', url: 'https://example.test/q1' }
    playbackState = 'paused'
    progress = 72
    networkState = { type: 'wifi', isConnected: true }
    refreshPromise = undefined
    preferenceState = { allowCellularPlayback: false }
    notify.mockReset()
    for (const mock of Object.values(rntp)) mock.mockClear()
    for (const mock of Object.values(controller)) mock.mockClear()
    rntp.getActiveTrack.mockImplementation(async () => activeTrack)
    rntp.getPlaybackState.mockImplementation(async () => ({ state: playbackState }))
    rntp.getProgress.mockImplementation(async () => ({ position: progress }))
    rntp.stop.mockImplementation(async () => { progress = 0; playbackState = 'stopped' })
    controller.recoverPlaybackAfterNetwork.mockImplementation(recoverSuccessfully)
    setup.applyPlaybackNetworkOptions.mockClear()
  }

  return {
    rntp,
    controller,
    setup,
    notify,
    NetworkStateType: { NONE: 'none', WIFI: 'wifi', ETHERNET: 'ethernet', CELLULAR: 'cellular', UNKNOWN: 'unknown' },
    Network: {
      getNetworkStateAsync: vi.fn(async () => refreshPromise ?? networkState),
      addNetworkStateListener: vi.fn((listener: (state: NetworkState) => void) => {
        networkListeners.add(listener)
        return { remove: vi.fn(() => networkListeners.delete(listener)) }
      }),
      emitNetwork,
      setRefreshPromise,
    },
    AppState: {
      currentState: 'active',
      addEventListener: vi.fn((_: string, listener: (state: string) => void) => {
        appListeners.add(listener)
        return { remove: vi.fn(() => appListeners.delete(listener)) }
      }),
      emitAppState,
    },
    Preferences: {
      usePlaybackNetworkPreferences: {
        getState: () => preferenceState,
        subscribe: (listener: (state: typeof preferenceState) => void) => {
          preferenceListeners.add(listener)
          return () => preferenceListeners.delete(listener)
        },
      },
      setPreference,
    },
    setActiveTrack: (track: { id: string; url: string }) => { activeTrack = track },
    setPlaybackState: (state: string) => { playbackState = state },
    setProgress: (position: number) => { progress = position },
    emitTrack,
    reset,
  }
})

vi.mock('react-native', () => ({ AppState: harness.AppState }))
vi.mock('expo-network', () => ({
  ...harness.Network,
  NetworkStateType: harness.NetworkStateType,
}))
vi.mock('react-native-track-player', () => ({
  default: harness.rntp,
  Event: {
    PlaybackState: 'playback-state',
    PlaybackActiveTrackChanged: 'active-track-changed',
    PlaybackProgressUpdated: 'playback-progress',
    RemoteDuck: 'remote-duck',
  },
  State: { Playing: 'playing', Buffering: 'buffering', Loading: 'loading' },
}))
vi.mock('@/lib/playback-network-preferences', () => harness.Preferences)
vi.mock('../../src/player/controller', () => harness.controller)
vi.mock('../../src/player/setup', () => harness.setup)

const { handleNetworkPlaybackFailure, startPlaybackNetworkMonitor } = await import('../../src/player/network-recovery')
const { usePlayerStore } = await import('../../src/player/store')
const { getPlaybackIntent, setNetworkPlaybackCheckpoint, setPlaybackIntent } = await import('../../src/player/playback-intent')
const { getPlaybackConnection, updatePlaybackConnection } = await import('../../src/player/network-access')

let dispose: (() => void) | undefined

function item(qid: string): QueueItem {
  return {
    qid,
    serverId: 'srv',
    trackId: qid,
    title: qid,
    artistText: '测试艺术家',
    durationMs: 180_000,
  }
}

function load(qid = 'q1'): void {
  usePlayerStore.getState().setQueue([item(qid)], 0)
  usePlayerStore.getState().setPendingCurrent(undefined)
  harness.setActiveTrack({ id: qid, url: `https://example.test/${qid}` })
}

function start(connection: 'wifi' | 'offline' | 'cellular' = 'wifi'): void {
  const state = connection === 'wifi'
    ? { type: harness.NetworkStateType.WIFI, isConnected: true }
    : connection === 'cellular'
      ? { type: harness.NetworkStateType.CELLULAR, isConnected: true }
      : { type: harness.NetworkStateType.NONE, isConnected: false }
  harness.Network.emitNetwork(state)
  updatePlaybackConnection(state as Parameters<typeof updatePlaybackConnection>[0])
  dispose = startPlaybackNetworkMonitor(harness.notify)
}

async function flush(): Promise<void> {
  // network-access starts its native read in a Promise microtask and then
  // resolves a Promise.race; keep this explicit so tests do not race that
  // bounded refresh implementation.
  for (let index = 0; index < 30; index += 1) await Promise.resolve()
}

function networkFailure() {
  return { message: 'network timeout', raw: { message: 'network timeout' } }
}

beforeEach(() => {
  vi.useFakeTimers()
  harness.reset()
  usePlayerStore.getState().clear()
  setNetworkPlaybackCheckpoint(undefined)
  setPlaybackIntent(false)
  updatePlaybackConnection({ type: harness.NetworkStateType.UNKNOWN, isConnected: true } as Parameters<typeof updatePlaybackConnection>[0])
  dispose = undefined
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.useRealTimers()
})

describe('播放网络恢复', () => {
  it('离线恢复 Wi-Fi 后以断开前进度续播，并清理恢复任务', async () => {
    load()
    harness.setProgress(123)
    setPlaybackIntent(true)
    start('offline')
    await flush()

    harness.Network.emitNetwork({ type: harness.NetworkStateType.WIFI, isConnected: true })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    await flush()

    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledWith('q1', 123, expect.any(Function), false)
    expect(harness.controller.stopPlaybackForNetwork).not.toHaveBeenCalled()
    expect(harness.notify).toHaveBeenCalledWith('网络已恢复，正在恢复播放')
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
  })

  it('完整本地文件不参与蜂窝网络阻断或恢复', async () => {
    load()
    harness.setActiveTrack({ id: 'q1', url: 'file:///cached/q1.m4a' })
    setPlaybackIntent(true)
    start('wifi')
    await flush()

    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(harness.controller.stopPlaybackForNetwork).not.toHaveBeenCalled()
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
    expect(harness.notify).not.toHaveBeenCalled()
  })

  it('本地曲目上的网络错误不会被接管为自动续播', async () => {
    load()
    harness.setActiveTrack({ id: 'q1', url: 'file:///cached/q1.m4a' })
    setPlaybackIntent(true)
    start('wifi')
    await flush()

    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(false)
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
  })

  it('原生切到本地文件后清掉旧的网络续播任务', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)

    harness.setActiveTrack({ id: 'q1', url: 'file:///cached/q1.m4a' })
    harness.emitTrack('active-track-changed', { track: { id: 'q1' } })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    await flush()

    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
  })

  it('Wi-Fi 切到蜂窝且未授权时停止远程播放，并且通知只出现一次', async () => {
    load()
    harness.setProgress(88)
    setPlaybackIntent(true)
    start('wifi')
    await flush()

    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()
    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()

    expect(harness.controller.stopPlaybackForNetwork).toHaveBeenCalled()
    expect(harness.notify).toHaveBeenCalledTimes(1)
    expect(harness.notify).toHaveBeenCalledWith('已切换到蜂窝网络；“仅 Wi-Fi 联网”已开启，在线播放已暂停')
    // The native stop reports zero afterwards; the monitor captured 88 before stopping.
    expect(harness.rntp.stop).toHaveBeenCalled()
    expect(harness.rntp.getProgress).toHaveBeenCalled()
  })

  it('开启蜂窝播放后只提示一次并从 native stop 前的位置恢复', async () => {
    load()
    harness.setProgress(88)
    setPlaybackIntent(true)
    start('wifi')
    await flush()

    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()
    harness.Preferences.setPreference(true)
    await flush()
    harness.Network.emitNetwork({ type: harness.NetworkStateType.WIFI, isConnected: true })
    await flush()
    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()

    expect(harness.notify).toHaveBeenCalledWith('已切换到蜂窝网络，继续播放将使用移动流量')
    expect(harness.notify.mock.calls.filter(([message]) => message === '已切换到蜂窝网络，继续播放将使用移动流量')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledWith('q1', 88, expect.any(Function), false)
  })

  it('蜂窝阻止后暂停再播放，原生进度归零也仍从 88 秒恢复', async () => {
    load()
    harness.setProgress(88)
    setPlaybackIntent(true)
    start('wifi')
    await flush()

    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()
    expect(harness.rntp.stop).toHaveBeenCalled()

    setPlaybackIntent(false)
    setPlaybackIntent(true)
    await flush()
    harness.Network.emitNetwork({ type: harness.NetworkStateType.WIFI, isConnected: true })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    await flush()

    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledWith('q1', 88, expect.any(Function), false)
  })

  it('过时的 Playing 事件不会清掉仍属于当前曲目的续播任务', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)

    harness.setPlaybackState('playing')
    harness.setActiveTrack({ id: 'other', url: 'https://example.test/other' })
    harness.emitTrack('playback-state', { state: 'playing' })
    harness.setActiveTrack({ id: 'q1', url: 'https://example.test/q1' })
    harness.setPlaybackState('paused')
    await flush()

    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledWith('q1', 72, expect.any(Function), true)
  })

  it('恢复命令成功但原生仍在缓冲时，下一次尝试至少等待 20 秒', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.setPlaybackState('buffering')
    harness.controller.recoverPlaybackAfterNetwork.mockImplementationOnce(async () => true)
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)

    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(18_000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(2)
  })

  it('连续 Buffering/Loading 事件不会重置同一曲目的 20 秒 watchdog', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.setPlaybackState('buffering')
    harness.emitTrack('playback-state', { state: 'buffering' })
    await vi.advanceTimersByTimeAsync(10_000)
    harness.setPlaybackState('loading')
    harness.emitTrack('playback-state', { state: 'loading' })
    await vi.advanceTimersByTimeAsync(9_999)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledWith('q1', 72, expect.any(Function), true)
  })

  it('PlaybackState Playing 事件会清除当前曲目的网络 checkpoint', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)
    setNetworkPlaybackCheckpoint({ qid: 'q1', position: 88 })
    harness.setPlaybackState('playing')
    harness.emitTrack('playback-state', { state: 'playing' })
    await flush()

    expect(getPlaybackIntent().networkCheckpoint).toBeUndefined()
  })

  it('续播尝试发现原生已 Playing 时也会清除网络 checkpoint', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)
    setNetworkPlaybackCheckpoint({ qid: 'q1', position: 88 })
    harness.setPlaybackState('playing')
    await vi.advanceTimersByTimeAsync(1000)
    await flush()

    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
    expect(getPlaybackIntent().networkCheckpoint).toBeUndefined()
  })

  it('缓冲 19 秒后切到受限蜂窝，不再触发缓冲恢复提示', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.setPlaybackState('buffering')
    harness.emitTrack('playback-state', { state: 'buffering' })
    await vi.advanceTimersByTimeAsync(19_000)
    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()
    await vi.advanceTimersByTimeAsync(21_000)
    expect(harness.controller.stopPlaybackForNetwork).toHaveBeenCalled()
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
    expect(harness.notify).not.toHaveBeenCalledWith('播放缓冲时间较长，正在尝试恢复')
  })

  it('Wi-Fi 持续缓冲 20 秒后进入自动续播', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.setPlaybackState('buffering')
    harness.emitTrack('playback-state', { state: 'buffering' })

    await vi.advanceTimersByTimeAsync(19_999)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(harness.notify).toHaveBeenCalledWith('播放缓冲时间较长，正在尝试恢复')
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledWith('q1', 72, expect.any(Function), true)
  })

  it('缓冲后恢复播放会取消 watchdog，不触发续播', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.setPlaybackState('buffering')
    harness.emitTrack('playback-state', { state: 'buffering' })
    harness.setPlaybackState('playing')
    harness.emitTrack('playback-state', { state: 'playing' })
    await flush()

    await vi.advanceTimersByTimeAsync(20_000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
  })

  it('手动暂停会取消缓冲 watchdog', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.setPlaybackState('buffering')
    harness.emitTrack('playback-state', { state: 'buffering' })
    harness.setPlaybackState('paused')
    harness.emitTrack('playback-state', { state: 'paused' })
    setPlaybackIntent(false)
    await flush()

    await vi.advanceTimersByTimeAsync(20_000)
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
  })

  it('蜂窝网络被阻止时再次点播放仍停留在阻止态，不会启动续播循环', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()

    setPlaybackIntent(false)
    setPlaybackIntent(true)
    await flush()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
    expect(harness.notify).toHaveBeenCalledWith('已切换到蜂窝网络；“仅 Wi-Fi 联网”已开启，在线播放已暂停')
  })

  it.each([
    ['暂停', () => setPlaybackIntent(false)],
    ['切换下一首', () => { load('q2'); setPlaybackIntent(true) }],
    ['退出登录', () => { usePlayerStore.getState().clear(); setPlaybackIntent(false) }],
  ])('%s 会取消延迟续播', async (_label, cancel) => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)
    cancel()
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
  })

  it('失败重试严格使用 1/2/4/8/16 秒并在第五次后停止', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.controller.recoverPlaybackAfterNetwork.mockRejectedValue(new Error('still offline'))
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)

    for (const [delay, count] of [[1000, 1], [2000, 2], [4000, 3], [8000, 4], [16000, 5]] as const) {
      await vi.advanceTimersByTimeAsync(delay)
      await flush()
      expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(count)
    }
    await vi.advanceTimersByTimeAsync(32_000)
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(5)
    expect(harness.notify).toHaveBeenCalledWith('网络或服务器仍不可用，已停止自动重试，请稍后点播放重试')
  })

  it('反复 Wi-Fi/蜂窝切换不会重置同一意图的五次重试预算', async () => {
    load()
    harness.Preferences.setPreference(true)
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.controller.recoverPlaybackAfterNetwork.mockRejectedValue(new Error('still offline'))
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)

    const delays = [1000, 2000, 4000, 8000, 16000]
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      await vi.advanceTimersByTimeAsync(delays[attempt])
      await flush()
      expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(attempt + 1)
      if (attempt < delays.length - 1) {
        const type = attempt % 2 === 0 ? harness.NetworkStateType.CELLULAR : harness.NetworkStateType.WIFI
        harness.Network.emitNetwork({ type, isConnected: true })
        await flush()
        await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)
      }
    }

    await vi.advanceTimersByTimeAsync(32_000)
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(5)
    expect(harness.notify).toHaveBeenCalledWith('网络或服务器仍不可用，已停止自动重试，请稍后点播放重试')
  })

  it('a slow route and HLS recovery stays current beyond the buffering watchdog', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    let currentAtCompletion: boolean | undefined
    harness.controller.recoverPlaybackAfterNetwork.mockImplementation(async (...args: unknown[]) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 30_000))
      currentAtCompletion = (args[2] as () => boolean)()
      harness.setPlaybackState('playing')
      harness.emitTrack('playback-state', { state: 'playing' })
      return true
    })
    await handleNetworkPlaybackFailure(networkFailure())
    await vi.advanceTimersByTimeAsync(31_000)
    await flush()
    expect(currentAtCompletion).toBe(true)
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(45_000)
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
  })

  it('单次续播超时期间不启动快速并发循环，超时后才进入下一次退避', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.controller.recoverPlaybackAfterNetwork.mockImplementation(() => new Promise<boolean>(() => undefined))
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)

    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(44_999)
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    await vi.advanceTimersByTimeAsync(2000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(2)
  })

  it('系统音频中断期间不重试，恢复后重新排程', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)
    harness.emitTrack('remote-duck', { paused: true, permanent: false })
    await vi.advanceTimersByTimeAsync(2000)
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()

    harness.emitTrack('remote-duck', { paused: false, permanent: false })
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
  })

  it('旧的悬挂续播在新意图切换到受阻蜂窝网络后不会占住新状态', async () => {
    load('q1')
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    let releaseOldAttempt!: () => void
    harness.controller.recoverPlaybackAfterNetwork.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { releaseOldAttempt = () => resolve(true) }),
    )
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)

    load('q2')
    setPlaybackIntent(true)
    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()

    expect(harness.controller.stopPlaybackForNetwork).toHaveBeenCalled()
    expect(harness.controller.recoverPlaybackAfterNetwork).toHaveBeenCalledTimes(1)
    releaseOldAttempt()
    await flush()
  })

  it('进度查询失败时仍停止受阻的远程播放', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    harness.rntp.getProgress.mockRejectedValueOnce(new Error('progress unavailable'))
    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()

    expect(harness.controller.stopPlaybackForNetwork).toHaveBeenCalledWith('q1', expect.any(Number), expect.any(Function))
    expect(harness.notify).toHaveBeenCalledWith('已切换到蜂窝网络；“仅 Wi-Fi 联网”已开启，在线播放已暂停')
  })

  it('释放监听器后不再接受失败、网络或偏好事件', async () => {
    load()
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    dispose?.()
    dispose = undefined

    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(false)
    harness.Network.emitNetwork({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    harness.Preferences.setPreference(true)
    harness.AppState.emitAppState('active')
    await flush()

    expect(harness.Network.addNetworkStateListener.mock.results[0]?.value.remove).toHaveBeenCalledTimes(1)
    expect(harness.AppState.addEventListener.mock.results[0]?.value.remove).toHaveBeenCalledTimes(1)
    expect(harness.controller.stopPlaybackForNetwork).not.toHaveBeenCalled()
  })

  it('延迟网络快照不会覆盖较新的 Wi-Fi 变化', async () => {
    load()
    setPlaybackIntent(true)
    let resolveSnapshot!: (state: { type: string; isConnected: boolean }) => void
    harness.Network.setRefreshPromise(new Promise((resolve) => { resolveSnapshot = resolve }))
    start('offline')
    await flush()

    harness.Network.emitNetwork({ type: harness.NetworkStateType.WIFI, isConnected: true })
    await flush()
    resolveSnapshot({ type: harness.NetworkStateType.CELLULAR, isConnected: true })
    await flush()

    expect(getPlaybackConnection()).toBe('wifi')
    expect(harness.controller.stopPlaybackForNetwork).not.toHaveBeenCalled()
  })

  it('当前曲目自动变化但用户意图未变时不会恢复旧曲目', async () => {
    load('q1')
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)
    load('q2')

    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
  })

  it('原生当前曲目变化后不会恢复旧曲目任务', async () => {
    load('q1')
    setPlaybackIntent(true)
    start('wifi')
    await flush()
    await expect(handleNetworkPlaybackFailure(networkFailure())).resolves.toBe(true)

    updatePlaybackConnection({ type: harness.NetworkStateType.CELLULAR, isConnected: true } as Parameters<typeof updatePlaybackConnection>[0])
    load('q2')
    harness.emitTrack('active-track-changed', { track: { id: 'q2' } })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    await flush()

    expect(harness.controller.stopPlaybackForNetwork).toHaveBeenCalledWith('q2', expect.any(Number), expect.any(Function))
    expect(harness.controller.recoverPlaybackAfterNetwork).not.toHaveBeenCalled()
  })
})
