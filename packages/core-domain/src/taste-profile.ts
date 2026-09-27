import type { Track } from './entities'
import type { EntityId } from './ids'

/**
 * 本地口味画像（Taste Profile）—— 纯逻辑，无副作用、无 IO、无随机，可直接单测。
 *
 * ── 为什么是「观察行为」而不是「让用户选」 ──────────────────────────────────
 * 本 App 的库多是「别人整理并分享、转存到自己网盘」的曲库：用户自己都还不认识这个库，
 * 让他勾「喜欢的歌手/流派」勾不出来。所以画像**只从播放行为里长出来**：
 * 听完 / 重复 / 收藏是正信号，**开头就跳过是最强的负信号**（快速剔除不喜欢的类别）。
 *
 * ── 冷启动怎么办 ────────────────────────────────────────────────────────────
 * 第 0 天没有行为数据时，用**库成分统计**当先验：这个库是某个人按他品味整理的，
 * 库的结构本身就带品味。随着行为事件累积，画像从「库先验」平滑过渡到「行为后验」。
 */

// ── 信号与权重 ───────────────────────────────────────────────────────────────

/** 一次播放行为产生的信号类型 */
export type TasteSignal =
  | 'completed' // 听完整首（强正）
  | 'repeated' // 重复播放 / 手动切回再听（强正）
  | 'favorited' // 收藏（强正）
  | 'unfavorited' // 取消收藏（负）
  | 'skippedEarly' // 开头 N 秒内跳过（强负）
  | 'skippedLate' // 中后段跳过（弱负）

/** 各信号对亲和度的加减权重。可按上线体感再调。 */
export const SIGNAL_WEIGHTS: Record<TasteSignal, number> = {
  completed: 1,
  repeated: 1.5,
  favorited: 3,
  unfavorited: -3,
  skippedEarly: -2,
  skippedLate: -0.5,
}

/** 亲和度各维度的相对重要度（组合成单曲得分时用）。艺人 > 流派 > 年代。 */
export const DIMENSION_WEIGHTS = {
  artist: 1,
  genre: 0.6,
  era: 0.3,
} as const

/** 时间衰减半衰期（毫秒）：默认 30 天，近期口味权重更高。 */
export const DEFAULT_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 冷启动融合常数 K：有效画像 = 库先验 与 行为后验 的加权融合，
 * 行为权重 alpha = eventCount / (eventCount + K)。eventCount=0 时全用先验，
 * 累积到约 K 条事件时先验/后验各占一半。
 */
export const BLEND_PRIOR_K = 40

// ── 特征 ────────────────────────────────────────────────────────────────────

/** 从一首曲目里抽出用于画像的离散特征 */
export interface TrackFeatures {
  artistIds: EntityId[]
  genreIds: EntityId[]
  /** 年代分桶，如 "1990s"；无 year 时为 "unknown" */
  era: string
}

/** 把年份归到年代桶 */
export function eraOf(year: number | undefined): string {
  if (!year || !Number.isFinite(year) || year <= 0) return 'unknown'
  const decade = Math.floor(year / 10) * 10
  return `${decade}s`
}

export function extractTrackFeatures(track: Track): TrackFeatures {
  return {
    artistIds: (track.artists ?? []).map((a) => a.id).filter(Boolean),
    genreIds: (track.genres ?? []).map((g) => g.id).filter(Boolean),
    era: eraOf(track.year),
  }
}

// ── 画像模型 ─────────────────────────────────────────────────────────────────

type AffinityMap = Record<string, number>

export interface TasteProfile {
  artist: AffinityMap
  genre: AffinityMap
  era: AffinityMap
  /** 已累积的事件数（用于冷启动融合） */
  eventCount: number
  /** 最近一次更新的时间戳（毫秒），用于时间衰减 */
  updatedAt: number
}

export function emptyProfile(now = 0): TasteProfile {
  return { artist: {}, genre: {}, era: {}, eventCount: 0, updatedAt: now }
}

/** 一次待应用的口味事件 */
export interface TasteEvent {
  features: TrackFeatures
  signal: TasteSignal
  /** 事件发生时间（毫秒） */
  at: number
}

// ── 更新（带时间衰减）────────────────────────────────────────────────────────

function decayFactor(dtMs: number, halfLifeMs: number): number {
  if (dtMs <= 0) return 1
  return Math.pow(0.5, dtMs / halfLifeMs)
}

function decayMap(map: AffinityMap, factor: number): AffinityMap {
  if (factor >= 1) return { ...map }
  const out: AffinityMap = {}
  for (const [key, value] of Object.entries(map)) {
    const decayed = value * factor
    // 衰减到接近 0 的项直接丢弃，避免 map 无限膨胀
    if (Math.abs(decayed) >= 1e-3) out[key] = decayed
  }
  return out
}

function addToMap(map: AffinityMap, keys: string[], delta: number): void {
  for (const key of keys) {
    map[key] = (map[key] ?? 0) + delta
  }
}

/**
 * 应用一次口味事件，返回**新的**画像（不修改入参）。
 * 先把已有权重按「距上次更新的时间」整体衰减，再叠加本次事件。
 */
export function applyEvent(
  profile: TasteProfile,
  event: TasteEvent,
  halfLifeMs = DEFAULT_HALF_LIFE_MS,
): TasteProfile {
  const factor = decayFactor(event.at - profile.updatedAt, halfLifeMs)
  const artist = decayMap(profile.artist, factor)
  const genre = decayMap(profile.genre, factor)
  const era = decayMap(profile.era, factor)

  const delta = SIGNAL_WEIGHTS[event.signal]
  addToMap(artist, event.features.artistIds, delta)
  addToMap(genre, event.features.genreIds, delta)
  addToMap(era, [event.features.era], delta)

  return {
    artist,
    genre,
    era,
    eventCount: profile.eventCount + 1,
    updatedAt: Math.max(profile.updatedAt, event.at),
  }
}

// ── 冷启动：库先验 ───────────────────────────────────────────────────────────

/** 库成分统计：各维度的计数（从整库/采样统计得来） */
export interface LibraryComposition {
  artistCounts: Record<string, number>
  genreCounts: Record<string, number>
  eraCounts: Record<string, number>
}

/** 把库成分计数归一化成一份「先验画像」（权重和为各维度内部相对占比） */
export function profileFromLibrary(composition: LibraryComposition, now = 0): TasteProfile {
  return {
    artist: normalizeCounts(composition.artistCounts),
    genre: normalizeCounts(composition.genreCounts),
    era: normalizeCounts(composition.eraCounts),
    eventCount: 0,
    updatedAt: now,
  }
}

/**
 * 从一批曲目统计库成分（艺人/流派/年代的出现次数），用作冷启动先验。
 * 传入的可以是整库或采样；采样足够大时分布就能代表库的口味倾向。
 */
export function libraryCompositionOf(tracks: Track[]): LibraryComposition {
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}
  const eraCounts: Record<string, number> = {}
  for (const track of tracks) {
    for (const artist of track.artists ?? []) {
      if (artist.id) artistCounts[artist.id] = (artistCounts[artist.id] ?? 0) + 1
    }
    for (const genre of track.genres ?? []) {
      if (genre.id) genreCounts[genre.id] = (genreCounts[genre.id] ?? 0) + 1
    }
    const era = eraOf(track.year)
    eraCounts[era] = (eraCounts[era] ?? 0) + 1
  }
  return { artistCounts, genreCounts, eraCounts }
}

function normalizeCounts(counts: Record<string, number>): AffinityMap {
  const total = Object.values(counts).reduce((s, v) => s + Math.max(0, v), 0)
  if (total <= 0) return {}
  const out: AffinityMap = {}
  for (const [key, value] of Object.entries(counts)) {
    if (value > 0) out[key] = value / total
  }
  return out
}

/**
 * 冷启动融合：把「库先验」和「行为后验」按事件量加权融合。
 * eventCount 越大，行为后验占比越高（alpha = n/(n+K)）。
 */
export function blendWithPrior(
  behavior: TasteProfile,
  prior: TasteProfile,
  k = BLEND_PRIOR_K,
): TasteProfile {
  const alpha = behavior.eventCount / (behavior.eventCount + k)
  return {
    artist: blendMaps(behavior.artist, prior.artist, alpha),
    genre: blendMaps(behavior.genre, prior.genre, alpha),
    era: blendMaps(behavior.era, prior.era, alpha),
    eventCount: behavior.eventCount,
    updatedAt: behavior.updatedAt,
  }
}

function blendMaps(behavior: AffinityMap, prior: AffinityMap, alpha: number): AffinityMap {
  // 行为侧先归一到 [-1,1] 量级，再和已归一的先验融合，避免量纲失衡
  const normBehavior = normalizeSigned(behavior)
  const keys = new Set([...Object.keys(normBehavior), ...Object.keys(prior)])
  const out: AffinityMap = {}
  for (const key of keys) {
    const b = normBehavior[key] ?? 0
    const p = prior[key] ?? 0
    out[key] = alpha * b + (1 - alpha) * p
  }
  return out
}

/** 把带正负的权重按绝对值最大者归一到 [-1,1] */
function normalizeSigned(map: AffinityMap): AffinityMap {
  let maxAbs = 0
  for (const v of Object.values(map)) maxAbs = Math.max(maxAbs, Math.abs(v))
  if (maxAbs <= 0) return {}
  const out: AffinityMap = {}
  for (const [key, value] of Object.entries(map)) out[key] = value / maxAbs
  return out
}

// ── 打分 ────────────────────────────────────────────────────────────────────

/**
 * 给单曲打「口味亲和度」分。画像各维度先归一，再按维度重要度加权求和，
 * 多个艺人/流派取平均，避免「艺人多」的歌天然占便宜。
 */
export function scoreTrack(track: Track, profile: TasteProfile): number {
  const features = extractTrackFeatures(track)
  const artist = normalizeSigned(profile.artist)
  const genre = normalizeSigned(profile.genre)
  const era = normalizeSigned(profile.era)

  const artistScore = averageAffinity(features.artistIds, artist)
  const genreScore = averageAffinity(features.genreIds, genre)
  const eraScore = era[features.era] ?? 0

  return (
    DIMENSION_WEIGHTS.artist * artistScore +
    DIMENSION_WEIGHTS.genre * genreScore +
    DIMENSION_WEIGHTS.era * eraScore
  )
}

function averageAffinity(keys: string[], map: AffinityMap): number {
  if (keys.length === 0) return 0
  let sum = 0
  for (const key of keys) sum += map[key] ?? 0
  return sum / keys.length
}
