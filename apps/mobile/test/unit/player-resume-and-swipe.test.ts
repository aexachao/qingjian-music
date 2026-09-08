import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(path: string): string {
  return readFileSync(resolve(__dirname, `../../src/${path}`), 'utf8')
}

describe('播放恢复与队列点击语义', () => {
  it('冷启动恢复触发转码替换时明确禁止续播', () => {
    const bridge = source('player/bridge.tsx')
    const controller = source('player/controller.ts')
    expect(bridge).toContain('resumePlayback: !isRestoringSession()')
    expect(bridge).toContain('resumePlayback: state === State.Playing')
    expect(controller).toContain("allowTranscode: itemIndex === index")
    expect(controller).toContain("if (options.resumePlayback !== false) await TrackPlayer.play()")
    expect(controller).toContain('await TrackPlayer.pause()')
  })

  it('左滑操作展开时首次点击只关闭操作，不切歌', () => {
    const queue = source('components/player/player-queue.tsx')
    expect(queue).toContain('if (closeOpenQueueAction()) return')
    expect(queue.indexOf('if (closeOpenQueueAction()) return')).toBeLessThan(queue.indexOf('onSelect()'))
  })
})
