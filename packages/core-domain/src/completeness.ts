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
  /** Disc number, when supplied by the catalog. */
  discNo?: number
  externalId?: string
}

/** 规范专辑(来自信息源的艺人作品集) */
export interface CanonicalAlbum {
  name: string
  year?: number
  artistName?: string
  edition?: string
  externalId?: string
}

export type TrackStatus = 'inLibrary' | 'missing' | 'ambiguous'

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
  /** 能匹配多个规范条目，不能安全归属的本地曲目 */
  ambiguousLocal: Track[]
  total: number
  owned: number
  missing: number
  ambiguous: number
}

/** Normalize punctuation and spacing while preserving parenthetical edition words. */
export function normalizeName(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[\s·・.,'"!?！？、，。—\-_/\\()[\]{}（）【】《》]/g, '')
    .trim()
}

function sameTrackTitle(canonical: CanonicalTrack, local: Track): boolean {
  return normalizeName(canonical.title) === normalizeName(local.title)
}

function canMatchTrack(canonical: CanonicalTrack, local: Track): boolean {
  if (!sameTrackTitle(canonical, local)) return false
  if (canonical.discNo !== undefined && local.discNo !== undefined && canonical.discNo !== local.discNo) return false
  if (canonical.trackNo !== undefined && local.trackNo !== undefined && canonical.trackNo !== local.trackNo) return false
  return true
}

/**
 * 专辑完整度:把本地曲目对齐到规范曲目表。
 * 只在规范曲目与本地曲目形成唯一的一对一匹配时标记「已有」。
 */
export function computeAlbumCompleteness(local: Track[], canonical: CanonicalTrack[]): AlbumCompleteness {
  const usedLocalIds = new Set<string>()
  const titleLocalCandidates = canonical.map((entry) => local.filter((track) => sameTrackTitle(entry, track)))
  const localCandidates = canonical.map((entry) => local.filter((track) => canMatchTrack(entry, track)))
  const canonicalCandidates = local.map((track) => canonical.filter((entry) => canMatchTrack(entry, track)))
  const entries: AlbumTrackEntry[] = canonical.map((c, index) => {
    const candidates = localCandidates[index] ?? []
    const hit = candidates.length === 1 && canonicalCandidates[local.indexOf(candidates[0]!) ]?.length === 1
      ? candidates[0]
      : undefined
    if (hit) {
      usedLocalIds.add(hit.id)
      return { canonical: c, local: hit, status: 'inLibrary' as const }
    }
    return { canonical: c, status: (titleLocalCandidates[index]?.length ?? 0) > 0 ? 'ambiguous' as const : 'missing' as const }
  })

  const extraLocal = local.filter((t) => !usedLocalIds.has(t.id))
  const ambiguousLocal = local.filter((t) => !usedLocalIds.has(t.id) && canonical.some((entry) => sameTrackTitle(entry, t)))
  const trueExtraLocal = extraLocal.filter((t) => !ambiguousLocal.some((ambiguous) => ambiguous.id === t.id))
  const owned = entries.filter((e) => e.status === 'inLibrary').length
  const missing = entries.filter((e) => e.status === 'missing').length
  const ambiguous = entries.filter((e) => e.status === 'ambiguous').length
  return {
    entries,
    extraLocal: trueExtraLocal,
    ambiguousLocal,
    total: canonical.length,
    owned,
    missing,
    ambiguous,
  }
}

export type AlbumStatus = 'inLibrary' | 'missing' | 'ambiguous'

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
  /** 能匹配多个规范条目，不能安全归属的本地专辑 */
  ambiguousLocal: Album[]
  total: number
  owned: number
  missing: number
  ambiguous: number
}

function meaningfulEdition(value: string | undefined): string {
  return normalizeName(value ?? '')
    .replace(/录音室版|录音室|专辑|album|single|ep|studio/g, '')
}

function canMatchAlbum(canonical: CanonicalAlbum, local: Album): boolean {
  const canonicalName = normalizeName(canonical.name)
  const localName = normalizeName(local.name)
  const edition = meaningfulEdition(canonical.edition)
  if (edition) {
    if (!localName.includes(edition)) return false
    if (canonicalName.replace(edition, '') !== localName.replace(edition, '')) return false
  } else if (canonicalName !== localName) {
    return false
  }
  if (canonical.artistName && !local.artists.some((artist) => normalizeName(artist.name) === normalizeName(canonical.artistName!))) return false
  const localYear = local.releaseDate?.slice(0, 4)
  if (canonical.year && localYear && Number(localYear) !== canonical.year) return false
  return true
}

/**
 * 艺人完整度:把本地专辑对齐到规范作品集。
 * v1 只区分「已入库 / 未入库」(专辑级);「部分入库」需逐张拉曲目表,留待后续。
 */
export function computeArtistCompleteness(localAlbums: Album[], canonical: CanonicalAlbum[]): ArtistCompleteness {
  const usedIds = new Set<string>()
  const localCandidates = canonical.map((entry) => localAlbums.filter((album) => canMatchAlbum(entry, album)))
  const canonicalCandidates = localAlbums.map((album) => canonical.filter((entry) => canMatchAlbum(entry, album)))
  const entries: ArtistAlbumEntry[] = canonical.map((c, index) => {
    const candidates = localCandidates[index] ?? []
    const hit = candidates.length === 1 && canonicalCandidates[localAlbums.indexOf(candidates[0]!) ]?.length === 1
      ? candidates[0]
      : undefined
    if (hit) {
      usedIds.add(hit.id)
      return { canonical: c, local: hit, status: 'inLibrary' as const }
    }
    return { canonical: c, status: candidates.length > 0 ? 'ambiguous' as const : 'missing' as const }
  })

  const extraLocal = localAlbums.filter((a) => !usedIds.has(a.id))
  const ambiguousLocal = localAlbums.filter((a, index) => !usedIds.has(a.id) && (canonicalCandidates[index]?.length ?? 0) > 0)
  const trueExtraLocal = extraLocal.filter((a) => !ambiguousLocal.some((ambiguous) => ambiguous.id === a.id))
  const owned = entries.filter((e) => e.status === 'inLibrary').length
  const missing = entries.filter((e) => e.status === 'missing').length
  const ambiguous = entries.filter((e) => e.status === 'ambiguous').length
  return {
    entries,
    extraLocal: trueExtraLocal,
    ambiguousLocal,
    total: canonical.length,
    owned,
    missing,
    ambiguous,
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
