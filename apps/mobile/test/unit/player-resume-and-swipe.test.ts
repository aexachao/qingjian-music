import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

function source(path: string): string {
  return readSource(path)
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

  it('上一首与下一首在切歌或回到开头后均恢复播放状态', () => {
    const controller = source('player/controller.ts')
    const prevFunc = controller.slice(
      controller.indexOf('export async function skipToPreviousSmart'),
      controller.indexOf('export async function skipToNextSafe'),
    )
    expect(prevFunc).toContain('await TrackPlayer.play()')
    const nextFunc = controller.slice(
      controller.indexOf('export async function skipToNextSafe'),
      controller.indexOf('export async function skipToIndex'),
    )
    expect(nextFunc).toContain('await TrackPlayer.play()')
  })

  it('快捷菜单支持 popDirection 并在队列卡片向下弹出时保证正序视觉排列', () => {
    const menu = source('lib/track-menu.ts')
    const queue = source('components/player/player-queue.tsx')
    // 向上弹出时整体反向（组顺序 + 组内顺序），向下弹出时保持正序
    expect(menu).toContain("popDirection: 'up' | 'down' = 'up'")
    expect(menu).toContain("popDirection === 'up'")
    expect(menu).toContain('groups.reverse()')
    expect(queue).toContain('popDirection="down"')
  })
})
