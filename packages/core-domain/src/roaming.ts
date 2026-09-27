import type { Track } from './entities'
import type { EntityId } from './ids'
import { scoreTrack, type TasteProfile } from './taste-profile'

/**
 * 本地漫游引擎 —— 纯逻辑，随机源可注入（默认 Math.random，测试传确定性 RNG）。
 *
 * 目标：替代飞牛「整库伪随机」。给每首候选打分
 *   score = 画像亲和度 → 指数变换成正权重
 *         × 新鲜度（近期放过的降权）
 *         × 多样性惩罚（连着同一歌手/专辑降权）
 * 然后**加权采样**滚动生成队列（不是取 top-N，避免天天同几首）；
 * 以 ε 概率注入一首「探索项」（陌生/近期没听的），既扩展口味又收集负反馈。
 */

/** 随机源：返回 [0,1) 的数。可注入以便测试。 */
export type Rng = () => number

export interface RoamingOptions {
  /** 生成多少首 */
  size: number
  /** 探索概率 ε（0..1）：以此概率不按亲和度、而是随机塞一首陌生的 */
  explorationRate?: number
  /** 近期放过的 trackId，用于新鲜度降权 */
  recentlyPlayedIds?: Iterable<EntityId>
  /** 近期项的权重乘子（<1），默认 0.15 */
  recentPenalty?: number
  /** 连着同一歌手/专辑的权重乘子（<1），默认 0.25 */
  diversityPenalty?: number
  /** 亲和度→权重 的温度：越小越「贪心」（拉开好坏差距），默认 0.5 */
  temperature?: number
}

interface Weighted {
  track: Track
  trackId: EntityId
  artistId?: EntityId
  albumId?: EntityId
  weight: number
  /** 是否近期放过（探索池会优先挑非近期的） */
  recent: boolean
}

const DEFAULTS = {
  explorationRate: 0.15,
  recentPenalty: 0.15,
  diversityPenalty: 0.25,
  temperature: 0.5,
}

/**
 * 生成漫游队列。纯函数：相同入参 + 相同 rng ⇒ 相同结果。
 * 不修改入参；不产生重复曲目（按 trackId 去重）。
 */
export function buildRoamingQueue(
  candidates: Track[],
  profile: TasteProfile,
  options: RoamingOptions,
  rng: Rng = Math.random,
): Track[] {
  const explorationRate = options.explorationRate ?? DEFAULTS.explorationRate
  const recentPenalty = options.recentPenalty ?? DEFAULTS.recentPenalty
  const diversityPenalty = options.diversityPenalty ?? DEFAULTS.diversityPenalty
  const temperature = options.temperature ?? DEFAULTS.temperature
  const recentSet = new Set(options.recentlyPlayedIds ?? [])

  // 去重 + 计算初始权重
  const seen = new Set<EntityId>()
  const pool: Weighted[] = []
  for (const track of candidates) {
    if (!track.id || seen.has(track.id)) continue
    seen.add(track.id)
    const affinity = scoreTrack(track, profile)
    const recent = recentSet.has(track.id)
    let weight = Math.exp(affinity / temperature)
    if (recent) weight *= recentPenalty
    pool.push({
      track,
      trackId: track.id,
      artistId: track.artists?.[0]?.id,
      albumId: track.album?.id,
      weight,
      recent,
    })
  }

  const target = Math.min(options.size, pool.length)
  const picked: Track[] = []

  for (let i = 0; i < target; i++) {
    const explore = rng() < explorationRate
    const index = explore ? pickExploration(pool, rng) : pickWeighted(pool, rng)
    if (index < 0) break

    const chosen = pool[index]
    if (!chosen) break
    picked.push(chosen.track)
    pool.splice(index, 1)

    // 多样性：给剩余里同歌手/同专辑的降权，减少连播撞车
    for (const item of pool) {
      if (
        (chosen.artistId && item.artistId === chosen.artistId) ||
        (chosen.albumId && item.albumId === chosen.albumId)
      ) {
        item.weight *= diversityPenalty
      }
    }
  }

  return picked
}

/** 按权重采样一个下标；权重非正时退化为均匀。返回 -1 表示池空。 */
function pickWeighted(pool: Weighted[], rng: Rng): number {
  if (pool.length === 0) return -1
  let total = 0
  for (const item of pool) total += Math.max(0, item.weight)
  if (total <= 0) return Math.floor(rng() * pool.length)

  let threshold = rng() * total
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i]
    if (!item) continue
    threshold -= Math.max(0, item.weight)
    if (threshold < 0) return i
  }
  return pool.length - 1
}

/** 探索：优先从「非近期」里均匀挑，全是近期时退回全体均匀。 */
function pickExploration(pool: Weighted[], rng: Rng): number {
  if (pool.length === 0) return -1
  const fresh: number[] = []
  for (let i = 0; i < pool.length; i++) if (!pool[i]?.recent) fresh.push(i)
  if (fresh.length > 0) return fresh[Math.floor(rng() * fresh.length)] ?? -1
  return Math.floor(rng() * pool.length)
}
