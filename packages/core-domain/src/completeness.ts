import type { Album, Track } from './entities'

/**
 * 完整度计算 —— 纯逻辑,不依赖任何外部源。
 *
 * 把本地曲库(飞牛)与「规范数据」(用户配置的国内信息源给出的专辑曲目/艺人作品)对齐,
 * 标出「已入库 / 缺失」。飞牛已刮削,本地名/曲目号可信,匹配以此为锚。
 *
 * 无信息源时,`inferTrackGaps` 只靠本地曲目号就能给出缺口提示(零依赖)。
 */

/** 规范曲目(来自信息源的专辑完整曲目表) */
export interface CanonicalTrack {
  title: string
  /** 曲目号,信息源给了才有 */
  trackNo?: number
}

/** 规范专辑(来自信息源的艺人作品集) */
export interface CanonicalAlbum {
  name: string
  year?: number
}

export type TrackStatus = 'inLibrary' | 'missing'

export interface AlbumTrackEntry {
  canonical: CanonicalTrack
  /** 命中的本地曲目(inLibrary 时有) */
  local?: Track
  status: TrackStatus
}

export interface AlbumCompleteness {
  /** 按规范曲目号排序的条目(含缺失占位) */
  entries: AlbumTrackEntry[]
  /** 本地有、但规范表里没有的曲目(规范不全时兜底展示) */
  extraLocal: Track[]
  total: number
  owned: number
  missing: number
}

/** 归一化名字用于匹配:小写、去括号内容、去标点空白 */
export function normalizeName(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[（(【\[《].*?[)）】\]》]/g, '')
    .replace(/[\s·・.,'"!?！？、，。—\-_/\\]/g, '')
    .trim()
}

/**
 * 专辑完整度:把本地曲目对齐到规范曲目表。
 * 匹配对「已有」宽松(归一化名相等即算命中),避免把"其实我有"误判成缺失。
 */
export function computeAlbumCompleteness(local: Track[], canonical: CanonicalTrack[]): AlbumCompleteness {
  const localByName = new Map<string, Track>()
  for (const t of local) {
    const key = normalizeName(t.title)
    if (key && !localByName.has(key)) localByName.set(key, t)
  }

  const usedLocalIds = new Set<string>()
  const entries: AlbumTrackEntry[] = canonical.map((c) => {
    const key = normalizeName(c.title)
    const hit = key ? localByName.get(key) : undefined
    if (hit && !usedLocalIds.has(hit.id)) {
      usedLocalIds.add(hit.id)
      return { canonical: c, local: hit, status: 'inLibrary' as const }
    }
    return { canonical: c, status: 'missing' as const }
  })

  const extraLocal = local.filter((t) => !usedLocalIds.has(t.id))
  const owned = entries.filter((e) => e.status === 'inLibrary').length
  return {
    entries,
    extraLocal,
    total: canonical.length,
    owned,
    missing: canonical.length - owned,
  }
}

export type AlbumStatus = 'inLibrary' | 'missing'

export interface ArtistAlbumEntry {
  canonical: CanonicalAlbum
  /** 命中的本地专辑(inLibrary 时有) */
  local?: Album
  status: AlbumStatus
}

export interface ArtistCompleteness {
  entries: ArtistAlbumEntry[]
  /** 本地有、规范作品集里没有的专辑 */
  extraLocal: Album[]
  total: number
  owned: number
  missing: number
}

/**
 * 艺人完整度:把本地专辑对齐到规范作品集。
 * v1 只区分「已入库 / 未入库」(专辑级);「部分入库」需逐张拉曲目表,留待后续。
 */
export function computeArtistCompleteness(localAlbums: Album[], canonical: CanonicalAlbum[]): ArtistCompleteness {
  const localByName = new Map<string, Album>()
  for (const a of localAlbums) {
    const key = normalizeName(a.name)
    if (key && !localByName.has(key)) localByName.set(key, a)
  }

  const usedIds = new Set<string>()
  const entries: ArtistAlbumEntry[] = canonical.map((c) => {
    const key = normalizeName(c.name)
    const hit = key ? localByName.get(key) : undefined
    if (hit && !usedIds.has(hit.id)) {
      usedIds.add(hit.id)
      return { canonical: c, local: hit, status: 'inLibrary' as const }
    }
    return { canonical: c, status: 'missing' as const }
  })

  const extraLocal = localAlbums.filter((a) => !usedIds.has(a.id))
  const owned = entries.filter((e) => e.status === 'inLibrary').length
  return {
    entries,
    extraLocal,
    total: canonical.length,
    owned,
    missing: canonical.length - owned,
  }
}

/**
 * 零依赖缺口提示:只看本地曲目号,推断 1..max 里缺了哪几号。
 * 例如本地有 [2,3,4,6,12] → 缺 [1,5,7,8,9,10,11]。
 * 没有信息源时用它给个"这张可能不全"的提示。
 */
export function inferTrackGaps(local: Track[]): number[] {
  const nums = local
    .map((t) => t.trackNo)
    .filter((n): n is number => typeof n === 'number' && n > 0)
  if (nums.length === 0) return []
  const present = new Set(nums)
  const max = Math.max(...nums)
  const gaps: number[] = []
  for (let i = 1; i < max; i++) if (!present.has(i)) gaps.push(i)
  return gaps
}
