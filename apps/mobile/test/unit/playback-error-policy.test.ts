import { describe, expect, it } from 'vitest'
import {
  AUTO_SKIP_WINDOW_MS,
  exceedsAutoSkipBudget,
  isNetworkFailure,
  MAX_AUTO_SKIPS_IN_WINDOW,
  normalizePlaybackError,
  pruneAutoSkips,
} from '../../src/player/playback-error-policy'

describe('播放错误负载归一化', () => {
  it('iOS 的负载只带 error 字段，也要能读出文案', () => {
    // 源码依据：ios/RNTrackPlayer/RNTrackPlayer.swift
    // emit(event: .PlaybackError, body: ["error": error?.localizedDescription])
    const normalized = normalizePlaybackError({ error: 'The item cannot be played' })
    expect(normalized.message).toBe('The item cannot be played')
    expect(normalized.code).toBeUndefined()
  })

  it('Android 的负载带 message / code，直接可用', () => {
    // 源码依据：android/.../MusicService.kt getPlaybackErrorBundle()
    const normalized = normalizePlaybackError({ message: 'Source error', code: 'android-2004' })
    expect(normalized.message).toBe('Source error')
    expect(normalized.code).toBe('android-2004')
  })

  it('两端字段都没有时不要造出空字符串，raw 保留下来给日志', () => {
    const normalized = normalizePlaybackError({})
    expect(normalized.code).toBeUndefined()
    expect(normalized.message).toBeUndefined()
    expect(normalized.raw).toEqual({})
  })

  it('空白文案视为没有', () => {
    expect(normalizePlaybackError({ error: '   ' }).message).toBeUndefined()
  })
})

describe('失败归因', () => {
  it('网络类失败要能认出来（否则会一路跳歌把队列烧完）', () => {
    expect(isNetworkFailure(normalizePlaybackError({ error: 'Not connected to internet' }))).toBe(true)
    expect(isNetworkFailure(normalizePlaybackError({ error: 'The request timed out' }))).toBe(true)
    expect(isNetworkFailure(normalizePlaybackError({ error: '网络不可达' }))).toBe(true)
  })

  it('格式类失败不算网络问题', () => {
    expect(isNetworkFailure(normalizePlaybackError({ error: 'The item was unplayable' }))).toBe(false)
    expect(isNetworkFailure(normalizePlaybackError({ error: 'Unsupported audio format' }))).toBe(false)
  })

  it('拿不到任何信息时不武断判成网络问题', () => {
    expect(isNetworkFailure(normalizePlaybackError({}))).toBe(false)
  })
})

describe('自动跳歌预算', () => {
  it('窗口内跳够上限就触发熔断', () => {
    const now = 1_000_000
    const skips = [now - 3_000, now - 2_000, now - 1_000]
    expect(exceedsAutoSkipBudget(skips, now)).toBe(true)
  })

  it('没跳够上限不熔断', () => {
    const now = 1_000_000
    expect(exceedsAutoSkipBudget([now - 1_000], now)).toBe(false)
    expect(exceedsAutoSkipBudget([], now)).toBe(false)
  })

  it('超出窗口的旧记录会被清掉，不会永久累积', () => {
    const now = 1_000_000
    const stale = [now - AUTO_SKIP_WINDOW_MS - 1, now - AUTO_SKIP_WINDOW_MS - 2]
    expect(pruneAutoSkips(stale, now)).toEqual([])
    expect(exceedsAutoSkipBudget(stale, now)).toBe(false)
  })

  it('上限是 3 次', () => {
    expect(MAX_AUTO_SKIPS_IN_WINDOW).toBe(3)
  })
})
