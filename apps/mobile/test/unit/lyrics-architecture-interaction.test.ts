import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

describe('播放器歌词页极简常驻架构与交互规范验证', () => {
  const playerSource = readSource('app/player.tsx')
  const lyricViewSource = readSource('components/lyric-view.tsx')
  const queueSource = readSource('components/player/player-queue.tsx')

  it('播放列表导出 CurrentTrackCard，并在歌词页吸顶固定复用', () => {
    // CurrentTrackCard 设为 export
    expect(queueSource).toContain('export function CurrentTrackCard')
    // player.tsx 导入 CurrentTrackCard
    expect(playerSource).toContain('CurrentTrackCard')
    // 歌词模式下顶部吸顶固定渲染 CurrentTrackCard
    expect(playerSource).toContain('styles.pinnedHeader')
    expect(playerSource).toContain('<CurrentTrackCard')
  })

  it('歌词和列表共享切换层，三个模式只保留一个播放器实例', () => {
    const transitionSource = readSource('components/player/player-mode-transition.tsx')
    expect(playerSource).toContain('<PlayerModeLayer progress={lyricAnim}')
    expect(playerSource).toContain('<PlayerModeLayer progress={listAnim}')
    expect(playerSource.match(/<PlayerDeck\b/g)).toHaveLength(1)
    expect(transitionSource).toContain("pointerEvents={active ? 'auto' : 'none'}")
    expect(transitionSource).toContain('accessibilityElementsHidden={!active}')
    expect(playerSource).toMatch(/<PlayerToolbar mode=\{mode\} onModeChange=\{/)
  })

  it('切换共用时序，不通过隐藏布局反复重建视口', () => {
    const deckSource = readSource('components/player/player-deck.tsx')
    expect(deckSource).not.toContain('maxHeight')
    expect(deckSource).not.toMatch(/marginBottom:\s*interpolate/)
    expect(playerSource).toContain('PLAYER_MODE_TIMING')
    expect(playerSource).not.toContain("display: 'none'")
  })

  it('切换到歌词页时无动画直达正确位置，且对行偏移与初始视口进行缓存预热', () => {
    expect(lyricViewSource).toContain('trackOffsetsCache')
    expect(lyricViewSource).toContain('justActivated')
    expect(lyricViewSource).toContain('animated: false')
    // contentOffset 稳定性由 lyric-motion.test.tsx 的真实 React 渲染测试覆盖。
    expect(playerSource).toContain("active={mode === 'lyrics'}")
  })

  it('歌词无模糊，正在唱的歌词字号提升至 28pt，滑动时不亮起矩形，仅选中时显示浅色圆角矩形板', () => {
    // 彻底移除 textShadowRadius 高斯模糊
    expect(lyricViewSource).not.toContain('textShadowRadius')
    // 正在唱的整行字号提升至 28
    expect(lyricViewSource).toContain('fontSize: 28')
    // 滑动按住时不亮起矩形底板（去掉 pressed）
    expect(lyricViewSource).toContain('selected && styles.rowSelected')
    expect(lyricViewSource).not.toContain('(pressed || selected) && styles.rowSelected')
    // 选中浅色矩形底板
    expect(lyricViewSource).toContain('rowSelected')
    expect(lyricViewSource).toContain('backgroundColor: colors.bgListItem')
  })

  it('手势与歌词动画防冲突：交互硬锁定、视口容差与宽容冷却期', () => {
    // 手指按住、拖动或惯性滚动期间硬锁定，绝不自动滚动
    expect(lyricViewSource).toContain('if (isInteractingRef.current) return')
    // 松手后的整个阅读保护期跳过滚动，即使当前行离屏也不抢回视口
    expect(lyricViewSource).toContain('userManualOverrideRef.current')
    expect(lyricViewSource).toContain('if (userManualOverrideRef.current && !forceCenter) return')
    // 移除废弃的多指/滑动甩动检测逻辑，保持简洁
    expect(lyricViewSource).not.toContain('checkFastScrollDownRealtime')
  })

  it('单行 LRC 严格使用整行高亮，不叠加无时间戳的虚假卡拉OK', () => {
    expect(lyricViewSource).toContain('isKaraokeLine(line: LyricLine)')
    expect(lyricViewSource).toContain('Array.isArray(line.words) && line.words.length >= 2')
  })

  it('底部工具栏预留底边距，空状态提示词上下居中', () => {
    expect(playerSource).toContain('const bottomChromeInset = portraitChromeHeight + toolbarHeight')
    expect(playerSource).toContain('onLayout={onPortraitChromeLayout}')
    expect(playerSource).toContain('onLayout={onToolbarLayout}')
    expect(playerSource).toContain('bottomSpace={bottomChromeInset}')
    expect(lyricViewSource).toContain('bottomSpace?: number')
    expect(lyricViewSource).toMatch(/styles\.center[\s\S]*?paddingBottom:\s*bottomSpace/)
    expect(lyricViewSource).toContain('暂无歌词')
  })

  it('播放列表视口占满舞台直达控制区：PlayerTitleRow 归入 coverStage，PlayerDeck 无幽灵高度', () => {
    const deckSource = readSource('components/player/player-deck.tsx')
    expect(deckSource).toContain('export function PlayerTitleRow')
    expect(playerSource).toContain('PlayerTitleRow')
    expect(playerSource).toMatch(/<PlayerDeck[^>]*\bhideTitle/)
    expect(playerSource).toContain('coverImageWrapper')
    expect(playerSource).toContain('titleRowWrapper')
  })

  it('歌词页到顶反弹后再下拉触发退场动画，支持刚体联动位移', () => {
    expect(playerSource).toContain('translateY={translateY}')
    expect(playerSource).toContain('onDismiss={dismiss}')
    expect(lyricViewSource).toContain('translateY?: SharedValue<number>')
    expect(lyricViewSource).toContain('dragStartedAtTopRef.value = event.contentOffset.y <= 1')
    expect(lyricViewSource).toContain('translateY.value = -event.contentOffset.y')
    expect(lyricViewSource).toContain('contentAnimatedStyle')
    expect(lyricViewSource).toContain('transform: [{ translateY: scrollY.value }]')
  })

  it('歌词底板矩形宽度撑满对齐、顺滑圆角与按压态离开即消', () => {
    // 宽度与对齐：撑满宽度、去除单边负外边距
    expect(lyricViewSource).toContain("width: '100%'")
    expect(lyricViewSource).toContain("alignSelf: 'stretch'")
    expect(lyricViewSource).not.toContain('marginHorizontal: -spacing.md')
    // 顺滑圆角与防溢出剪裁
    expect(lyricViewSource).toContain('borderRadius: radius.lg')
    expect(lyricViewSource).toContain("overflow: 'hidden'")
    // 按压态驱动：按下亮起、离开立即消失、滑动即刻熄灭
    expect(lyricViewSource).toContain('pressingRowIndex')
    expect(lyricViewSource).toContain('onPressIn')
    expect(lyricViewSource).toContain('onPressOut')
    expect(lyricViewSource).toContain('setPressingRowIndex(null)')
  })
})
