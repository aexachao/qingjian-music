import { beforeEach, describe, expect, it, vi } from 'vitest'

const stored = new Map<string, string>()
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => stored.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { stored.set(key, value) }),
}))

async function loadPreferences() {
  vi.resetModules()
  return import('../../src/lib/cache-preferences')
}

describe('缓存偏好', () => {
  beforeEach(() => {
    stored.clear()
  })

  it('设置 size/count 后立即应用缓存限额', async () => {
    const enforceCacheLimits = vi.fn()
    const { registerCacheLimitEnforcer, useCachePreferences } = await loadPreferences()
    registerCacheLimitEnforcer(enforceCacheLimits)
    useCachePreferences.getState().setSizeLimitKey('512MB')
    expect(enforceCacheLimits).toHaveBeenCalledTimes(1)
    expect(useCachePreferences.getState().sizeLimitKey).toBe('512MB')
    useCachePreferences.getState().setCountLimitKey('100')
    expect(enforceCacheLimits).toHaveBeenCalledTimes(2)
    expect(useCachePreferences.getState().countLimitKey).toBe('100')
  })

  it('恢复时只接受枚举中的 size/count，非法值保留默认', async () => {
    stored.set('qj.prefs.cache', JSON.stringify({
      autoCacheEnabled: false,
      sizeLimitKey: '999GB',
      countLimitKey: -1,
    }))
    const { useCachePreferences } = await loadPreferences()
    await vi.waitFor(() => expect(useCachePreferences.getState().autoCacheEnabled).toBe(false))
    expect(useCachePreferences.getState().sizeLimitKey).toBe('2GB')
    expect(useCachePreferences.getState().countLimitKey).toBe('unlimited')
  })

  it('恢复合法枚举值', async () => {
    stored.set('qj.prefs.cache', JSON.stringify({ sizeLimitKey: '5GB', countLimitKey: '300' }))
    const { useCachePreferences } = await loadPreferences()
    await vi.waitFor(() => expect(useCachePreferences.getState().sizeLimitKey).toBe('5GB'))
    expect(useCachePreferences.getState().countLimitKey).toBe('300')
  })
})
