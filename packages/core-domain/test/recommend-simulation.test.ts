import { describe, expect, it } from 'vitest'
import {
  applyEvent,
  buildRoamingQueue,
  emptyProfile,
  extractTrackFeatures,
  ROAMING_DEFAULTS,
  type Rng,
  type TasteEvent,
  type TasteProfile,
  type TasteSignal,
  type Track,
} from '../src/index'

/**
 * 漫游引擎的「合成场景」调优验证。
 *
 * 真正的超参调优需要线上真实行为数据，这里退而求其次：用**可控的合成听歌行为**
 * 检验默认超参能否产生我们想要的三条动态——
 *   1. 收敛性：一直听 A 类、开头就跳 B 类，一段时间后漫游队列被 A 主导；
 *   2. 探索性：即便强烈偏好 A，探索仍会不时露出 B（口味能改，负反馈能收集）；
 *   3. 多样性：一条队列里不会同歌手连着挤在一起。
 * 这几条同时是「防止调参把引擎调坏」的回归护栏。
 */

// 确定性 RNG（mulberry32）
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

function track(id: string, genre: string, artist: string): Track {
  return {
    id,
    title: id,
    durationMs: 200_000,
    artists: [{ id: artist, name: artist }],
    genres: [{ id: genre, name: genre }],
    isCue: false,
  }
}

// 合成曲库：like 类 30 首（6 个歌手），dislike 类 30 首（6 个歌手）
const library: Track[] = []
for (let i = 0; i < 30; i++) library.push(track(`L${i}`, 'like', `LA${i % 6}`))
for (let i = 0; i < 30; i++) library.push(track(`D${i}`, 'dislike', `DA${i % 6}`))

function event(t: Track, signal: TasteSignal, at: number): TasteEvent {
  return { features: extractTrackFeatures(t), signal, at }
}

/** 模拟一段听歌：听完 like、开头跳 dislike，返回训练后的画像 */
function train(rounds: number): TasteProfile {
  let profile = emptyProfile(0)
  let at = 0
  for (let r = 0; r < rounds; r++) {
    for (const t of library) {
      at += 60_000
      const signal: TasteSignal = t.genres[0]!.id === 'like' ? 'completed' : 'skippedEarly'
      profile = applyEvent(profile, event(t, signal, at))
    }
  }
  return profile
}

describe('漫游引擎 · 合成场景调优验证', () => {
  it('收敛性：训练后漫游队列被偏好类主导', () => {
    const profile = train(3)
    let likeInTop10 = 0
    const trials = 30
    for (let s = 0; s < trials; s++) {
      // 关掉探索单看「利用」效果
      const queue = buildRoamingQueue(library, profile, { size: 10, explorationRate: 0 }, seededRng(s))
      likeInTop10 += queue.filter((t) => t.genres[0]!.id === 'like').length
    }
    const likeRatio = likeInTop10 / (trials * 10)
    // 前 10 首里 like 类应占绝大多数
    expect(likeRatio).toBeGreaterThan(0.8)
  })

  it('探索性：默认 ε 下，dislike 类仍会不时露出（口味可改、能收负反馈）', () => {
    const profile = train(3)
    let dislikeSeen = 0
    const trials = 60
    for (let s = 0; s < trials; s++) {
      const queue = buildRoamingQueue(library, profile, { size: 10 }, seededRng(s * 7 + 1))
      if (queue.some((t) => t.genres[0]!.id === 'dislike')) dislikeSeen++
    }
    // 大多数场次至少露出一首 dislike（否则探索太弱，负反馈永远收集不到）
    expect(dislikeSeen).toBeGreaterThan(trials * 0.4)
  })

  it('多样性：默认惩罚下，队列里同歌手不连续', () => {
    const profile = train(2)
    let adjacentSameArtist = 0
    const trials = 30
    for (let s = 0; s < trials; s++) {
      const queue = buildRoamingQueue(library, profile, { size: 12, explorationRate: 0 }, seededRng(s + 100))
      for (let i = 1; i < queue.length; i++) {
        if (queue[i]!.artists[0]!.id === queue[i - 1]!.artists[0]!.id) adjacentSameArtist++
      }
    }
    // 连续同歌手应极少（多样性惩罚生效）
    expect(adjacentSameArtist).toBeLessThan(trials) // 平均每条队列 < 1 次
  })

  it('冷启动（零训练）不偏科：like/dislike 大致各半', () => {
    const profile = emptyProfile(0)
    let like = 0
    const trials = 40
    for (let s = 0; s < trials; s++) {
      const queue = buildRoamingQueue(library, profile, { size: 10, explorationRate: 0 }, seededRng(s * 3))
      like += queue.filter((t) => t.genres[0]!.id === 'like').length
    }
    const ratio = like / (trials * 10)
    expect(ratio).toBeGreaterThan(0.35)
    expect(ratio).toBeLessThan(0.65)
  })

  it('默认超参在合理区间（防手滑调坏的护栏）', () => {
    expect(ROAMING_DEFAULTS.explorationRate).toBeGreaterThan(0.05)
    expect(ROAMING_DEFAULTS.explorationRate).toBeLessThan(0.35)
    expect(ROAMING_DEFAULTS.temperature).toBeGreaterThan(0)
    expect(ROAMING_DEFAULTS.diversityPenalty).toBeLessThan(1)
    expect(ROAMING_DEFAULTS.recentPenalty).toBeLessThan(1)
  })
})
