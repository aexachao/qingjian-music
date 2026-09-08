import { describe, expect, it } from 'vitest'
import { GenerationToken } from '../../src/player/generation-token'

describe('播放器 generation token', () => {
  it('队列切换后旧异步结果失效', () => {
    const generation = new GenerationToken()
    const stale = generation.capture()
    expect(generation.isCurrent(stale)).toBe(true)

    const current = generation.advance()

    expect(generation.isCurrent(stale)).toBe(false)
    expect(generation.isCurrent(current)).toBe(true)
  })
})
