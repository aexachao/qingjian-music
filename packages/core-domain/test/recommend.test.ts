import { describe, expect, it } from 'vitest'
import {
  applyEvent,
  blendWithPrior,
  buildRoamingQueue,
  emptyProfile,
  eraOf,
  extractTrackFeatures,
  libraryCompositionOf,
  profileFromLibrary,
  scoreTrack,
  SIGNAL_WEIGHTS,
  type Rng,
  type TasteEvent,
  type Track,
} from '../src/index'

// ── 测试用曲目工厂 ─────────────────────────────────────────────────────────
function track(
  id: string,
  opts: { artist?: string; genre?: string; year?: number; album?: string } = {},
): Track {
  return {
    id,
    title: id,
    durationMs: 200_000,
    artists: opts.artist ? [{ id: opts.artist, name: opts.artist }] : [],
    genres: opts.genre ? [{ id: opts.genre, name: opts.genre }] : [],
    year: opts.year,
    album: opts.album ? { id: opts.album, name: opts.album } : undefined,
    isCue: false,
  }
}

function eventFor(t: Track, signal: TasteEvent['signal'], at: number): TasteEvent {
  return { features: extractTrackFeatures(t), signal, at }
}

/** 确定性 RNG（mulberry32），让漫游结果可复现 */
function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('年代分桶 eraOf', () => {
  it('按十年归桶', () => {
    expect(eraOf(1997)).toBe('1990s')
    expect(eraOf(2000)).toBe('2000s')
    expect(eraOf(2019)).toBe('2010s')
  })
  it('无/非法年份归 unknown', () => {
    expect(eraOf(undefined)).toBe('unknown')
    expect(eraOf(0)).toBe('unknown')
    expect(eraOf(-5)).toBe('unknown')
  })
})

describe('画像更新与打分', () => {
  it('听完使该艺人/流派得分上升，且高于陌生曲目', () => {
    const liked = track('t1', { artist: 'A', genre: 'rock', year: 1995 })
    const stranger = track('t2', { artist: 'Z', genre: 'classical', year: 1960 })
    let p = emptyProfile(0)
    p = applyEvent(p, eventFor(liked, 'completed', 1000))
    expect(scoreTrack(liked, p)).toBeGreaterThan(scoreTrack(stranger, p))
  })

  it('开头跳过是强负信号，压低同类曲目得分', () => {
    const disliked = track('t1', { artist: 'A', genre: 'metal' })
    let p = emptyProfile(0)
    p = applyEvent(p, eventFor(disliked, 'skippedEarly', 1000))
    expect(scoreTrack(disliked, p)).toBeLessThan(0)
  })

  it('收藏比听完权重更高', () => {
    expect(SIGNAL_WEIGHTS.favorited).toBeGreaterThan(SIGNAL_WEIGHTS.completed)
  })

  it('applyEvent 不修改入参（不可变）', () => {
    const t = track('t1', { artist: 'A' })
    const p0 = emptyProfile(0)
    const p1 = applyEvent(p0, eventFor(t, 'completed', 1000))
    expect(p0.artist).toEqual({})
    expect(p1.eventCount).toBe(1)
    expect(p0.eventCount).toBe(0)
  })

  it('时间衰减让久远的偏好淡化', () => {
    const old = track('t1', { artist: 'A' })
    const fresh = track('t2', { artist: 'B' })
    const halfLife = 10_000
    let p = emptyProfile(0)
    p = applyEvent(p, eventFor(old, 'completed', 0), halfLife)
    // 很久以后（多个半衰期）再听 B：A 已被大幅衰减
    p = applyEvent(p, eventFor(fresh, 'completed', halfLife * 5), halfLife)
    expect(scoreTrack(fresh, p)).toBeGreaterThan(scoreTrack(old, p))
  })
})

describe('冷启动：库先验与融合', () => {
  it('无行为时用库先验：库里占比高的流派得分更高', () => {
    const prior = profileFromLibrary({
      artistCounts: {},
      genreCounts: { pop: 80, jazz: 20 },
      eraCounts: {},
    })
    const behavior = emptyProfile(0)
    const blended = blendWithPrior(behavior, prior)
    const popTrack = track('t1', { genre: 'pop' })
    const jazzTrack = track('t2', { genre: 'jazz' })
    expect(scoreTrack(popTrack, blended)).toBeGreaterThan(scoreTrack(jazzTrack, blended))
  })

  it('行为累积后后验压过先验', () => {
    const prior = profileFromLibrary({
      artistCounts: {},
      genreCounts: { pop: 100 },
      eraCounts: {},
    })
    let behavior = emptyProfile(0)
    // 大量收藏 jazz
    for (let i = 0; i < 100; i++) {
      behavior = applyEvent(behavior, eventFor(track(`j${i}`, { genre: 'jazz' }), 'favorited', i))
    }
    const blended = blendWithPrior(behavior, prior)
    const popTrack = track('p', { genre: 'pop' })
    const jazzTrack = track('j', { genre: 'jazz' })
    expect(scoreTrack(jazzTrack, blended)).toBeGreaterThan(scoreTrack(popTrack, blended))
  })

  it('libraryCompositionOf 统计艺人/流派/年代出现次数', () => {
    const comp = libraryCompositionOf([
      track('a', { artist: 'A', genre: 'rock', year: 1995 }),
      track('b', { artist: 'A', genre: 'pop', year: 2003 }),
      track('c', { artist: 'B', genre: 'rock', year: 1998 }),
    ])
    expect(comp.artistCounts).toEqual({ A: 2, B: 1 })
    expect(comp.genreCounts).toEqual({ rock: 2, pop: 1 })
    expect(comp.eraCounts).toEqual({ '1990s': 2, '2000s': 1 })
  })
})

describe('漫游队列', () => {
  const pool: Track[] = [
    track('a1', { artist: 'A', genre: 'rock', album: 'albA' }),
    track('a2', { artist: 'A', genre: 'rock', album: 'albA' }),
    track('b1', { artist: 'B', genre: 'pop', album: 'albB' }),
    track('c1', { artist: 'C', genre: 'jazz', album: 'albC' }),
    track('d1', { artist: 'D', genre: 'folk', album: 'albD' }),
  ]

  it('确定性：相同 rng 产出相同队列', () => {
    const p = emptyProfile(0)
    const q1 = buildRoamingQueue(pool, p, { size: 4 }, seededRng(42))
    const q2 = buildRoamingQueue(pool, p, { size: 4 }, seededRng(42))
    expect(q1.map((t) => t.id)).toEqual(q2.map((t) => t.id))
  })

  it('不产生重复、不超过池容量', () => {
    const p = emptyProfile(0)
    const q = buildRoamingQueue(pool, p, { size: 100 }, seededRng(7))
    expect(q.length).toBe(pool.length)
    expect(new Set(q.map((t) => t.id)).size).toBe(pool.length)
  })

  it('去重输入中重复的 trackId', () => {
    const dup = [...pool, track('a1', { artist: 'A' })]
    const q = buildRoamingQueue(dup, emptyProfile(0), { size: 100 }, seededRng(1))
    expect(q.filter((t) => t.id === 'a1').length).toBe(1)
  })

  it('高亲和度曲目在多数随机种子下更早出现（关闭探索）', () => {
    let p = emptyProfile(0)
    // 强烈偏好艺人 C
    for (let i = 0; i < 20; i++) {
      p = applyEvent(p, eventFor(track(`c${i}`, { artist: 'C', genre: 'jazz' }), 'favorited', i))
    }
    let cFirstHalf = 0
    const trials = 40
    for (let s = 0; s < trials; s++) {
      const q = buildRoamingQueue(pool, p, { size: 5, explorationRate: 0 }, seededRng(s))
      const pos = q.findIndex((t) => t.id === 'c1')
      if (pos >= 0 && pos < 2) cFirstHalf++
    }
    // 偏好的曲目应在多数试验里排进前两位
    expect(cFirstHalf).toBeGreaterThan(trials / 2)
  })

  it('近期播放过的被降权（更晚出现）', () => {
    const p = emptyProfile(0)
    let b1Late = 0
    const trials = 40
    for (let s = 0; s < trials; s++) {
      const q = buildRoamingQueue(
        pool,
        p,
        { size: 5, explorationRate: 0, recentlyPlayedIds: ['b1'] },
        seededRng(s),
      )
      const pos = q.findIndex((t) => t.id === 'b1')
      if (pos >= 2) b1Late++
    }
    expect(b1Late).toBeGreaterThan(trials / 2)
  })

  it('空候选返回空队列', () => {
    expect(buildRoamingQueue([], emptyProfile(0), { size: 5 }, seededRng(1))).toEqual([])
  })
})
