import { describe, expect, it } from 'vitest'
import {
  marqueeMetrics,
  MARQUEE_GAP,
  MARQUEE_MS_PER_PIXEL,
  MARQUEE_OVERFLOW_THRESHOLD,
} from '../../src/lib/marquee-policy'
import { hasNoCode, readSource } from '../support/source'

describe('播放器长文本展示', () => {
  it('装得下就不滚：还没测量（容器宽 0）或没超出阈值时都不启动动画', () => {
    expect(marqueeMetrics(100, 0).shouldScroll).toBe(false)
    expect(marqueeMetrics(100, 100).shouldScroll).toBe(false)
    // 刚好等于阈值仍算装得下，给文字测量留误差余量
    expect(marqueeMetrics(100 + MARQUEE_OVERFLOW_THRESHOLD, 100).shouldScroll).toBe(false)
  })

  it('超出阈值才滚，位移取「文字宽度 + 间隙」让第二份文字无缝接上', () => {
    const metrics = marqueeMetrics(200, 100)
    expect(metrics.shouldScroll).toBe(true)
    expect(metrics.distance).toBe(200 + MARQUEE_GAP)
    expect(metrics.duration).toBe(Math.round((200 + MARQUEE_GAP) * MARQUEE_MS_PER_PIXEL))
  })

  it('位移恒为正且时长随文字变长而增加（单向匀速滚动，不做左右反弹）', () => {
    const short = marqueeMetrics(150, 100)
    const long = marqueeMetrics(400, 100)
    expect(short.distance).toBeGreaterThan(0)
    expect(long.distance).toBeGreaterThan(0)
    expect(long.duration).toBeGreaterThan(short.duration)
  })

  it('跑马灯组件接上策略模块，并按需渲染第二份文字', () => {
    const marquee = readSource('components/marquee-text.tsx')
    expect(marquee).toContain('marqueeMetrics(textWidth, containerWidth)')
    expect(marquee).toContain('{shouldScroll ? (')
    // 单向滚动：不允许退回「来回反弹」的 withSequence 写法
    expect(hasNoCode('components/marquee-text.tsx', 'withSequence(')).toBe(true)
  })

  it('迷你播放器标题使用跑马灯，播放页副标题只显示歌手', () => {
    expect(readSource('components/mini-player.tsx')).toContain('<MarqueeText text={current.title}')
    expect(readSource('components/player/player-deck.tsx')).toContain('text={current.artistText}')
  })
})
