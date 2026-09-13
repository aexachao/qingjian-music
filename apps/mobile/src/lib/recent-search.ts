import * as SecureStore from 'expo-secure-store'
import { addRecentKeyword, removeRecentKeyword, sanitizeRecentKeywords } from './recent-search-policy'

/**
 * 搜索历史落在 Keychain（与服务器配置同一套 SecureStore），
 * 不参与 iCloud 备份之外的任何同步，纯本地。
 * SecureStore 的 key 只允许字母数字与 . - _
 */
const KEY_RECENT_SEARCH = 'qj.recentSearch'

export async function listRecentSearches(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_RECENT_SEARCH)
    if (!raw) return []
    return sanitizeRecentKeywords(JSON.parse(raw) as unknown)
  } catch {
    // 值被写坏（非 JSON）时当作空历史，并顺手清掉脏数据，避免每次读都抛
    await SecureStore.deleteItemAsync(KEY_RECENT_SEARCH).catch(() => undefined)
    return []
  }
}

async function writeRecentSearches(list: string[]): Promise<string[]> {
  await SecureStore.setItemAsync(KEY_RECENT_SEARCH, JSON.stringify(list))
  return list
}

/** 记一条搜索历史并返回写入后的完整列表（调用方直接用返回值刷 UI） */
export async function pushRecentSearch(keyword: string): Promise<string[]> {
  return writeRecentSearches(addRecentKeyword(await listRecentSearches(), keyword))
}

export async function removeRecentSearch(keyword: string): Promise<string[]> {
  return writeRecentSearches(removeRecentKeyword(await listRecentSearches(), keyword))
}

export async function clearRecentSearches(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_RECENT_SEARCH)
}
