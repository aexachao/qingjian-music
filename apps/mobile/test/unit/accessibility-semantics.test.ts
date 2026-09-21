import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

describe('关键交互无障碍语义', () => {
  it('队列清除、移除和歌词分享操作都有可读标签', () => {
    const queue = readSource('components/player/player-queue.tsx')
    const lyrics = readSource('components/lyric-view.tsx')
    expect(queue).toContain('accessibilityLabel="清除历史记录"')
    // 左滑删除的标签按模式分派：待播行「从队列移除」、历史行「删除历史记录」
    expect(queue).toContain('`从队列移除 ${item.title}`')
    expect(queue).toContain('`删除历史记录 ${item.title}`')
    expect(lyrics).toContain('accessibilityLabel="复制全部歌词"')
    expect(lyrics).toContain('accessibilityLabel="分享全部歌词"')
  })

  it('曲目行向辅助技术暴露当前播放选中态', () => {
    const trackRow = readSource('components/track-row.tsx')
    // 非选择态暴露「正在播放」，选择态暴露「已选中」——两条都要在（第 2 轮加的多选）
    expect(trackRow).toContain('{ selected: playing }')
    expect(trackRow).toContain('{ selected: selection.selected }')
    expect(trackRow).toContain('accessibilityRole="checkbox"')
  })
})
