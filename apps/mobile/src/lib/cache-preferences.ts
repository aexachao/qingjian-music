import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
export type CacheLimitEnforcer = () => void | Promise<void>
let cacheLimitEnforcer: CacheLimitEnforcer = () => undefined

export function registerCacheLimitEnforcer(enforcer: CacheLimitEnforcer): void {
  cacheLimitEnforcer = enforcer
}

const KEY_CACHE_PREFS = 'qj.prefs.cache'

export type CacheSizeKey = '512MB' | '1GB' | '2GB' | '5GB' | '10GB' | 'unlimited'

export interface CacheSizeOption {
  key: CacheSizeKey
  label: string
  bytes: number // 0 means unlimited
}

export const CACHE_SIZE_OPTIONS: CacheSizeOption[] = [
  { key: '512MB', label: '512 MB', bytes: 512 * 1024 * 1024 },
  { key: '1GB', label: '1 GB', bytes: 1 * 1024 * 1024 * 1024 },
  { key: '2GB', label: '2 GB', bytes: 2 * 1024 * 1024 * 1024 },
  { key: '5GB', label: '5 GB', bytes: 5 * 1024 * 1024 * 1024 },
  { key: '10GB', label: '10 GB', bytes: 10 * 1024 * 1024 * 1024 },
  { key: 'unlimited', label: '无限制', bytes: 0 },
]

export type CacheCountKey = '100' | '300' | '500' | '1000' | 'unlimited'

export interface CacheCountOption {
  key: CacheCountKey
  label: string
  count: number // 0 means unlimited
}

export const CACHE_COUNT_OPTIONS: CacheCountOption[] = [
  { key: '100', label: '100 首', count: 100 },
  { key: '300', label: '300 首', count: 300 },
  { key: '500', label: '500 首', count: 500 },
  { key: '1000', label: '1000 首', count: 1000 },
  { key: 'unlimited', label: '无限制', count: 0 },
]

const CACHE_SIZE_KEYS = new Set<CacheSizeKey>(CACHE_SIZE_OPTIONS.map((option) => option.key))
const CACHE_COUNT_KEYS = new Set<CacheCountKey>(CACHE_COUNT_OPTIONS.map((option) => option.key))

export function isCacheSizeKey(value: unknown): value is CacheSizeKey {
  return typeof value === 'string' && CACHE_SIZE_KEYS.has(value as CacheSizeKey)
}

export function isCacheCountKey(value: unknown): value is CacheCountKey {
  return typeof value === 'string' && CACHE_COUNT_KEYS.has(value as CacheCountKey)
}

interface CachePreferencesData {
  autoCacheEnabled: boolean
  sizeLimitKey: CacheSizeKey
  countLimitKey: CacheCountKey
}

interface CachePreferencesState extends CachePreferencesData {
  setAutoCacheEnabled: (enabled: boolean) => void
  setSizeLimitKey: (key: CacheSizeKey) => void
  setCountLimitKey: (key: CacheCountKey) => void
}

async function persist(state: CachePreferencesData) {
  try {
    await SecureStore.setItemAsync(
      KEY_CACHE_PREFS,
      JSON.stringify({
        autoCacheEnabled: state.autoCacheEnabled,
        sizeLimitKey: state.sizeLimitKey,
        countLimitKey: state.countLimitKey,
      }),
    )
  } catch {
    // 忽略存储写入失败，内存中依然有效
  }
}

export const useCachePreferences = create<CachePreferencesState>((set, get) => ({
  autoCacheEnabled: true,
  sizeLimitKey: '2GB',
  countLimitKey: 'unlimited',
  setAutoCacheEnabled: (autoCacheEnabled) => {
    set({ autoCacheEnabled })
    void persist(get())
  },
  setSizeLimitKey: (sizeLimitKey) => {
    set({ sizeLimitKey })
    void persist(get())
    void Promise.resolve(cacheLimitEnforcer()).catch((error: unknown) => {
      console.warn('应用缓存容量上限失败', error)
    })
  },
  setCountLimitKey: (countLimitKey) => {
    set({ countLimitKey })
    void persist(get())
    void Promise.resolve(cacheLimitEnforcer()).catch((error: unknown) => {
      console.warn('应用缓存歌曲数量上限失败', error)
    })
  },
}))

// 初始化：异步从本地 SecureStore 恢复上次设置
void (async () => {
  try {
    const raw = await SecureStore.getItemAsync(KEY_CACHE_PREFS)
    if (raw) {
      const data = JSON.parse(raw) as Partial<CachePreferencesData>
      useCachePreferences.setState({
        ...(typeof data.autoCacheEnabled === 'boolean' ? { autoCacheEnabled: data.autoCacheEnabled } : {}),
        ...(isCacheSizeKey(data.sizeLimitKey) ? { sizeLimitKey: data.sizeLimitKey } : {}),
        ...(isCacheCountKey(data.countLimitKey) ? { countLimitKey: data.countLimitKey } : {}),
      })
    }
  } catch {
    // 忽略解析错误
  }
})()

export function isAutoCacheEnabled(): boolean {
  return useCachePreferences.getState().autoCacheEnabled
}

export function getCurrentCacheBudgetBytes(): number {
  const key = useCachePreferences.getState().sizeLimitKey
  return CACHE_SIZE_OPTIONS.find((item) => item.key === key)?.bytes ?? 2 * 1024 * 1024 * 1024
}

export function getCurrentCacheCountLimit(): number {
  const key = useCachePreferences.getState().countLimitKey
  return CACHE_COUNT_OPTIONS.find((item) => item.key === key)?.count ?? 0
}
