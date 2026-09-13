/**
 * 搜索历史的纯策略层：不碰存储、不依赖 RN，方便直接跑单测。
 * 存储 I/O 见 `recent-search.ts`。
 */

/** 最多保留多少条历史（SecureStore 单值有大小上限，不宜无限增长） */
export const RECENT_SEARCH_LIMIT = 10

/**
 * 关键词归一化：去掉首尾空白、把内部连续空白压成一个空格。
 * 返回空串表示这个词不该进历史（纯空白输入）。
 */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, ' ')
}

/**
 * 把关键词插到历史最前面。
 *
 * - 大小写不敏感去重：重复搜索同一词只保留最新一条，避免历史里堆 "周杰伦" 与 "周杰伦 "；
 * - 超出上限时丢弃最旧的；
 * - 空关键词原样返回，不产生垃圾条目。
 */
export function addRecentKeyword(
  list: readonly string[],
  keyword: string,
  limit: number = RECENT_SEARCH_LIMIT,
): string[] {
  const normalized = normalizeKeyword(keyword)
  if (!normalized) return [...list]
  const lower = normalized.toLowerCase()
  const rest = list.filter((item) => item.toLowerCase() !== lower)
  return [normalized, ...rest].slice(0, Math.max(0, limit))
}

/** 删除某条历史（大小写不敏感） */
export function removeRecentKeyword(list: readonly string[], keyword: string): string[] {
  const lower = normalizeKeyword(keyword).toLowerCase()
  return list.filter((item) => item.toLowerCase() !== lower)
}

/**
 * 清洗从存储读出来的原始值：过滤非字符串 / 空串 / 重复项，并裁到上限。
 * 历史是纯本地数据，用户换设备或降级安装都可能留下脏值，读的时候一律兜住。
 */
export function sanitizeRecentKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const normalized = normalizeKeyword(item)
    if (!normalized) continue
    if (out.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) continue
    out.push(normalized)
    if (out.length >= RECENT_SEARCH_LIMIT) break
  }
  return out
}
