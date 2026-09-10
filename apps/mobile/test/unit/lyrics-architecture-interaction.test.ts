import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('播放器歌词页极简常驻架构与交互规范验证', () => {
  const playerSource = readFileSync(resolve(__dirname, '../../src/app/player.tsx'), 'utf8')
  const lyricViewSource = readFileSync(resolve(__dirname, '../../src/components/lyric-view.tsx'), 'utf8')
  const queueSource = readFileSync(resolve(__dirname, '../../src/components/player/player-queue.tsx'), 'utf8')

  it('播放列表导出 CurrentTrackCard，并在歌词页吸顶固定复用', () => {
    // CurrentTrackCard 设为 export
    expect(queueSource).toContain('export function CurrentTrackCard')
    // player.tsx 导入 CurrentTrackCard
    expect(playerSource).toContain('CurrentTrackCard')
    // 歌词模式下顶部吸顶固定渲染 CurrentTrackCard
    expect(playerSource).toContain('styles.pinnedHeader')
    expect(playerSource).toContain('<CurrentTrackCard')
  })

  it('歌词模式下平滑遮罩封面与播放控制区(PlayerDeck)，工具栏常驻底部', () => {
    // 歌词模式与列表模式通过 stageViewport 双层覆盖与 GPU 景深转场平滑衔接
    expect(playerSource).toContain('stageViewport')
    expect(playerSource).toContain("pointerEvents={mode === 'lyrics' ? 'auto' : 'none'}")
    expect(playerSource).toContain("pointerEvents={mode !== 'lyrics' ? 'auto' : 'none'}")
    expect(playerSource).toContain('lyricsContainerAnimatedStyle')
    expect(playerSource).toContain('coverListContainerAnimatedStyle')
    // 底部工具栏常驻在主视图下方
    expect(playerSource).toContain('styles.toolbar')
    expect(playerSource).toContain('accessibilityLabel="歌词"')
    expect(playerSource).toContain('accessibilityLabel="隔空播放"')
    expect(playerSource).toContain('accessibilityLabel="播放队列"')
    // 不再包含浮动控制区样式或隐藏计时器
    expect(playerSource).not.toContain('floatingBottomControls')
    expect(playerSource).not.toContain('CHROME_HIDE_IDLE_MS')
    expect(playerSource).not.toContain('hideTimer')
  })

  it('封面、播放列表与歌词之间采用统一景深 scale 与微位移过渡，且禁用 layout 尺寸动画', () => {
    const deckSource = readFileSync(resolve(__dirname, '../../src/components/player/player-deck.tsx'), 'utf8')
    // PlayerDeck 标题收起禁用 maxHeight 与 marginBottom 破坏性布局动画，保证播放控制按钮绝对稳定
    expect(deckSource).not.toContain('maxHeight')
    expect(deckSource).not.toContain('marginBottom')
    // player.tsx 具备统一的 lyricAnim 与 listAnim 贝塞尔曲线过渡
    expect(playerSource).toContain('lyricAnim')
    expect(playerSource).toContain('listAnim')
    expect(playerSource).toContain('coverAnimatedStyle')
    expect(playerSource).toContain('queueAnimatedStyle')
  })

  it('切换到歌词页时无动画直达正确位置，且对行偏移与初始视口进行缓存预热', () => {
    expect(lyricViewSource).toContain('trackOffsetsCache')
    expect(lyricViewSource).toContain('justActivated')
    expect(lyricViewSource).toContain('animated: false')
    expect(lyricViewSource).toContain('contentOffset={{')
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
    expect(lyricViewSource).toContain("backgroundColor: 'rgba(255, 255, 255, 0.08)'")
  })

  it('手势与歌词动画防冲突：交互硬锁定、视口容差与宽容冷却期', () => {
    // 手指按住、拖动或惯性滚动期间硬锁定，绝不自动滚动
    expect(lyricViewSource).toContain('if (isInteractingRef.current) return')
    // 松手后的宽容视口判定：若新行仍在舒适安全区（safeTop ~ safeBottom）内，跳过滚动，仅文字原地高亮
    expect(lyricViewSource).toContain('userManualOverrideRef.current')
    expect(lyricViewSource).toContain('targetY >= safeTop && targetY <= safeBottom')
    // 移除废弃的多指/滑动甩动检测逻辑，保持简洁
    expect(lyricViewSource).not.toContain('checkFastScrollDownRealtime')
  })

  it('单行 LRC 严格使用整行高亮，不叠加无时间戳的虚假卡拉OK', () => {
    expect(lyricViewSource).toContain('isKaraokeLine(line: LyricLine)')
    expect(lyricViewSource).toContain('Array.isArray(line.words) && line.words.length >= 2')
  })

  it('底部工具栏预留底边距，空状态提示词上下居中', () => {
    expect(playerSource).toContain('bottomSpace={48 + insets.bottom}')
    expect(lyricViewSource).toContain('bottomSpace?: number')
    expect(lyricViewSource).toMatch(/styles\.center[\s\S]*?paddingBottom:\s*bottomSpace/)
    expect(lyricViewSource).toContain('暂无歌词')
  })

  it('播放列表视口占满舞台直达控制区：PlayerTitleRow 归入 coverStage，PlayerDeck 无幽灵高度', () => {
    const deckSource = readFileSync(resolve(__dirname, '../../src/components/player/player-deck.tsx'), 'utf8')
    expect(deckSource).toContain('export function PlayerTitleRow')
    expect(playerSource).toContain('PlayerTitleRow')
    expect(playerSource).toContain('hideTitle={true}')
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

  it('暂停状态下歌词自由滑动不回跳，恢复播放后平滑跳转到当前行', () => {
    // player.tsx 与 LyricView 接入 playing 状态
    expect(playerSource).toContain('playing={playing}')
    expect(lyricViewSource).toContain('playing?: boolean')
    // 暂停状态下自由滑动不启动闲置恢复计时器
    expect(lyricViewSource).toContain('if (!playing) return')
    expect(lyricViewSource).toContain('if (!playing && userManualOverrideRef.current) return')
    // 恢复播放检测与平滑居中跳转
    expect(lyricViewSource).toContain('justResumed = playing && !prevPlayingRef.current')
    expect(lyricViewSource).toContain('scrollToActiveIndex(activeIndex, { animated: true, forceCenter: true })')
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
