import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  module: { promoteUpcomingTrackSource: vi.fn(async () => true) } as Record<string, any>,
}))
vi.mock('react-native', () => ({
  Platform: native.platform,
  NativeModules: { TrackPlayerModule: native.module },
}))
import { promoteUpcomingTrackSource } from '../../src/player/native-queue-source'

beforeEach(() => {
  native.platform.OS = 'ios'
  native.module.promoteUpcomingTrackSource = vi.fn(async () => true)
})

describe('native inactive queue source promotion', () => {
  it('passes occurrence identity and expected source for native stale/current checks', async () => {
    const local = { url: 'file:///cache/song.flac', contentType: 'audio/flac' }
    await expect(promoteUpcomingTrackSource('qid-2', 'https://music/song', local)).resolves.toBe(true)
    expect(native.module.promoteUpcomingTrackSource).toHaveBeenCalledWith('qid-2', 'https://music/song', local)
    native.module.promoteUpcomingTrackSource.mockResolvedValue(false)
    await expect(promoteUpcomingTrackSource('qid-2', 'old-url', local)).resolves.toBe(false)
  })

  it('rejects remote replacements without invoking native code', async () => {
    await expect(promoteUpcomingTrackSource('q', 'old', { url: 'https://music/new' })).resolves.toBe(false)
    expect(native.module.promoteUpcomingTrackSource).not.toHaveBeenCalled()
  })

  it('leaves unsupported platforms and old binaries on the activation fallback', async () => {
    native.platform.OS = 'android'
    await expect(promoteUpcomingTrackSource('q', 'old', { url: 'file:///song' })).resolves.toBe(false)
    expect(native.module.promoteUpcomingTrackSource).not.toHaveBeenCalled()
    native.platform.OS = 'ios'
    delete native.module.promoteUpcomingTrackSource
    await expect(promoteUpcomingTrackSource('q', 'old', { url: 'file:///song' })).resolves.toBe(false)
  })
})
