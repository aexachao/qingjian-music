import { describe, expect, it, vi } from 'vitest'

const { getNetworkStateAsync, networkStateType } = vi.hoisted(() => ({
  getNetworkStateAsync: vi.fn(),
  networkStateType: { WIFI: 'WIFI', ETHERNET: 'ETHERNET', CELLULAR: 'CELLULAR', UNKNOWN: 'UNKNOWN' },
}))
vi.mock('expo-network', () => ({
  getNetworkStateAsync,
  NetworkStateType: networkStateType,
}))

import { getPlaybackNetworkType, selectPlaybackQuality } from '../../src/lib/playback-quality'

describe('播放网络音质选择', () => {
  const preferences = { wifiQuality: 'original', cellularQuality: 'standard' } as const

  it('Wi-Fi/以太网使用 Wi-Fi 偏好，蜂窝使用移动网络偏好', () => {
    expect(selectPlaybackQuality('wifi', preferences, true)).toBe('original')
    expect(selectPlaybackQuality('cellular', preferences, true)).toBe('medium')
  })

  it('未知网络保守使用移动网络偏好而非 Wi-Fi', () => {
    expect(selectPlaybackQuality('unknown', preferences, true)).toBe('medium')
  })

  it('后端不支持码率档位时恒按原始音质，绝不据偏好强制转码', () => {
    // 回归防线：飞牛转码恒输出无损 FLAC、服务端忽略 bitrate，
    // 「标准音质」在那里省不了流量，却会让每首歌都走转码链路。
    expect(selectPlaybackQuality('wifi', preferences, false)).toBe('original')
    expect(selectPlaybackQuality('cellular', preferences, false)).toBe('original')
    expect(selectPlaybackQuality('unknown', preferences, false)).toBe('original')
    expect(selectPlaybackQuality('cellular', { wifiQuality: 'standard', cellularQuality: 'standard' }, false)).toBe(
      'original',
    )
  })

  it.each([
    [networkStateType.WIFI, 'wifi'],
    [networkStateType.ETHERNET, 'wifi'],
    [networkStateType.CELLULAR, 'cellular'],
    [networkStateType.UNKNOWN, 'unknown'],
  ] as const)('将 Expo 网络类型 %s 映射为 %s', async (type, expected) => {
    getNetworkStateAsync.mockResolvedValueOnce({ type, isConnected: true })
    await expect(getPlaybackNetworkType()).resolves.toBe(expected)
  })

  it('网络 API 异常时保守回退 unknown', async () => {
    getNetworkStateAsync.mockRejectedValueOnce(new Error('native unavailable'))
    await expect(getPlaybackNetworkType()).resolves.toBe('unknown')
  })
})
