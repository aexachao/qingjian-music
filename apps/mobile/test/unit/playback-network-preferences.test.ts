import { beforeEach, describe, expect, it, vi } from 'vitest'

const stored = new Map<string, string>()
let read: (() => Promise<string | null>) | undefined
const getItemAsync = vi.fn(async (key: string) => (read ? read() : stored.get(key) ?? null))
const setItemAsync = vi.fn(async (key: string, value: string) => {
  stored.set(key, value)
})

vi.mock('expo-secure-store', () => ({
  getItemAsync,
  setItemAsync,
}))

async function loadPreferences() {
  vi.resetModules()
  return import('../../src/lib/playback-network-preferences')
}

describe('播放网络偏好', () => {
  beforeEach(() => {
    stored.clear()
    read = undefined
    getItemAsync.mockClear()
    setItemAsync.mockClear()
  })

  it('“仅 Wi-Fi 联网”默认关闭，并持久化用户选择', async () => {
    const { hydratePlaybackNetworkPreferences, usePlaybackNetworkPreferences } = await loadPreferences()
    await hydratePlaybackNetworkPreferences()

    expect(usePlaybackNetworkPreferences.getState().allowCellularPlayback).toBe(true)
    usePlaybackNetworkPreferences.getState().setAllowCellularPlayback(false)
    await vi.waitFor(() => expect(stored.get('qj.prefs.wifi_only')).toBe('{"wifiOnly":true}'))
  })

  it('恢复已保存的设置，并在重新加载模块后继续使用', async () => {
    stored.set('qj.prefs.wifi_only', JSON.stringify({ wifiOnly: false }))
    const first = await loadPreferences()
    await first.hydratePlaybackNetworkPreferences()
    expect(first.usePlaybackNetworkPreferences.getState().allowCellularPlayback).toBe(true)

    const second = await loadPreferences()
    await second.hydratePlaybackNetworkPreferences()
    expect(second.usePlaybackNetworkPreferences.getState().allowCellularPlayback).toBe(true)
  })

  it('旧蜂窝播放开关不会让升级后的仅 Wi-Fi 联网默认开启', async () => {
    stored.set('qj.prefs.playback_network', JSON.stringify({ allowCellularPlayback: false }))
    const preferences = await loadPreferences()

    await preferences.hydratePlaybackNetworkPreferences()

    expect(preferences.usePlaybackNetworkPreferences.getState().allowCellularPlayback).toBe(true)
  })

  it('新版本明确开启的仅 Wi-Fi 联网设置可在启动后恢复', async () => {
    stored.set('qj.prefs.wifi_only', JSON.stringify({ wifiOnly: true }))
    const preferences = await loadPreferences()

    await preferences.hydratePlaybackNetworkPreferences()

    expect(preferences.usePlaybackNetworkPreferences.getState().allowCellularPlayback).toBe(false)
  })

  it('较新的早期用户操作覆盖正在读取的旧值，并按最终值写回', async () => {
    let resolveRead!: (value: string | null) => void
    read = () => new Promise<string | null>((resolve) => { resolveRead = resolve })
    stored.set('qj.prefs.wifi_only', JSON.stringify({ wifiOnly: true }))

    const { hydratePlaybackNetworkPreferences, usePlaybackNetworkPreferences } = await loadPreferences()
    const hydration = hydratePlaybackNetworkPreferences()
    usePlaybackNetworkPreferences.getState().setAllowCellularPlayback(true)
    resolveRead(stored.get('qj.prefs.wifi_only') ?? null)

    await expect(hydration).resolves.toBe(true)
    expect(usePlaybackNetworkPreferences.getState().allowCellularPlayback).toBe(true)
    await vi.waitFor(() => expect(stored.get('qj.prefs.wifi_only')).toBe('{"wifiOnly":false}'))
  })

  it('读取失败时保持新默认值且不把它覆盖到 SecureStore', async () => {
    read = async () => { throw new Error('SecureStore unavailable') }
    stored.set('qj.prefs.wifi_only', JSON.stringify({ wifiOnly: false }))

    const { hydratePlaybackNetworkPreferences, usePlaybackNetworkPreferences } = await loadPreferences()
    await expect(hydratePlaybackNetworkPreferences()).resolves.toBe(false)

    expect(usePlaybackNetworkPreferences.getState().allowCellularPlayback).toBe(true)
    expect(usePlaybackNetworkPreferences.getState().hydrated).toBe(false)
    expect(setItemAsync).not.toHaveBeenCalled()
    expect(stored.get('qj.prefs.wifi_only')).toBe('{"wifiOnly":false}')
  })
})
