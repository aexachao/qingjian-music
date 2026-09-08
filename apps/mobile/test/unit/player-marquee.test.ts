import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(path: string): string {
  return readFileSync(resolve(__dirname, `../../src/${path}`), 'utf8')
}

describe('播放器长文本展示', () => {
  it('跑马灯使用两份文本单向无缝滚动，不再左右反弹', () => {
    const marquee = source('components/marquee-text.tsx')
    expect(marquee).toContain('const distance = textWidth + MARQUEE_GAP')
    expect(marquee).toContain('{shouldScroll ? (')
    expect(marquee).not.toContain('withSequence(')
  })

  it('迷你播放器标题使用跑马灯，播放页副标题只显示歌手', () => {
    const mini = source('components/mini-player.tsx')
    const deck = source('components/player/player-deck.tsx')
    expect(mini).toContain('<MarqueeText text={current.title} style={styles.title} />')
    expect(deck).toContain('text={current.artistText}')
    expect(deck).not.toContain('current.albumText ?')
  })
})
