import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

describe('关键交互无障碍语义', () => {
  it('队列清除、移除和歌词分享操作都有可读标签', () => {
    const queue = readSource('components/player/player-queue.tsx')
    const lyricsSheet = readSource('components/player/lyrics-sheet-modal.tsx')
    expect(queue).toContain('accessibilityLabel="清除播放历史"')
    // 左滑删除的标签按模式分派：待播行「从队列移除」、历史行「删除历史记录」
    expect(queue).toContain('`从队列移除 ${item.title}`')
    expect(queue).toContain('`删除历史记录 ${item.title}`')
    expect(lyricsSheet).toContain("'复制所选歌词' : copyLabel") // 成功/失败标签由 lyric-motion 的真实渲染测试覆盖
    expect(lyricsSheet).toContain('accessibilityLabel="分享所选歌词"')
  })

  it('曲目行向辅助技术暴露当前播放选中态', () => {
    const trackRow = readSource('components/track-row.tsx')
    // 非选择态暴露「正在播放」，选择态暴露「已选中」——两条都要在（第 2 轮加的多选）
    expect(trackRow).toContain('{ selected: playing, disabled: isDisabled }')
    expect(trackRow).toContain('{ selected: selection.selected }')
    expect(trackRow).toContain('accessibilityRole="checkbox"')
  })
})
