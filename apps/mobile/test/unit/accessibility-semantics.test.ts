import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

describe('关键交互无障碍语义', () => {
  it('队列清除、移除和歌词分享操作都有可读标签', () => {
    const queue = readSource('components/player/player-queue.tsx')
    const lyrics = readSource('components/lyric-view.tsx')
    expect(queue).toContain('accessibilityLabel="清除播放历史"')
    expect(queue).toContain('accessibilityLabel={`从队列移除 ${item.title}`}')
    expect(lyrics).toContain('accessibilityLabel="复制全部歌词"')
    expect(lyrics).toContain('accessibilityLabel="分享全部歌词"')
  })

  it('曲目行向辅助技术暴露当前播放选中态', () => {
    const trackRow = readSource('components/track-row.tsx')
    expect(trackRow).toContain('accessibilityState={{ selected: playing }}')
  })
})
