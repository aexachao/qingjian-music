import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('播放器歌词页架构与交互规范验证', () => {
  const playerSource = readFileSync(resolve(__dirname, '../../src/app/player.tsx'), 'utf8')
  const lyricViewSource = readFileSync(resolve(__dirname, '../../src/components/lyric-view.tsx'), 'utf8')
  const deckSource = readFileSync(resolve(__dirname, '../../src/components/player/player-deck.tsx'), 'utf8')
  const queueSource = readFileSync(resolve(__dirname, '../../src/components/player/player-queue.tsx'), 'utf8')

  it('播放列表导出 CurrentTrackCard，并在歌词页吸顶固定复用', () => {
    // CurrentTrackCard 设为 export
    expect(queueSource).toContain('export function CurrentTrackCard')
    // player.tsx 导入 CurrentTrackCard
    expect(playerSource).toContain('CurrentTrackCard')
    // 歌词模式下顶部吸顶固定渲染 CurrentTrackCard
    expect(playerSource).toMatch(/mode === 'lyrics'\s*\?\s*\([\s\S]*?<CurrentTrackCard/)
    expect(playerSource).toContain('styles.pinnedHeader')
  })

  it('PlayerDeck 支持 hideTitle 属性，歌词模式下移除重复的歌名歌手行', () => {
    // PlayerDeck 支持 hideTitle 属性
    expect(deckSource).toContain('hideTitle?: boolean')
    expect(deckSource).toContain('!hideTitle ?')
    // 歌词模式下传入 hideTitle={true}
    expect(playerSource).toMatch(/<PlayerDeck[\s\S]*?hideTitle=\{true\}/)
  })

  it('底部控制区透明且纯渐隐消失（无 translateY 位移），计时器通过 ref 防重入且暂停时不隐藏', () => {
    // 底部控制区背景透明
    expect(playerSource).toMatch(/floatingBottomControls:[\s\S]*?backgroundColor:\s*'transparent'/)
    // 底部控制区动画使用纯 opacity，不进行 translateY 位移
    expect(playerSource).toContain('const bottomChromeStyle = useAnimatedStyle')
    expect(playerSource).toMatch(/bottomChromeStyle[\s\S]*?opacity:\s*chromeAnim\.value/)
    // 引入 chromeVisibleRef 阻断 useEffect 循环重入唤起
    expect(playerSource).toContain('const chromeVisibleRef = useRef(true)')
    // 歌词页顶部吸顶 Header 在歌词模式下 opacity 恒定为 1，不随控制区渐隐
    expect(playerSource).toMatch(/topHandleStyle[\s\S]*?mode === 'lyrics' \? 1 : chromeAnim\.value/)
    // 歌曲暂停或无歌词时常驻
    expect(playerSource).toContain("if (mode === 'lyrics' && playing && hasLyrics)")
  })

  it('歌词无模糊，正在唱的歌词字号提升至 28pt，滑动时不亮起矩形，仅选中/长按时显示浅色圆角矩形板', () => {
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

  it('快速下甩零延迟实时唤起，上滑歌词立即隐藏控制区，唤醒后无操作重新进入3秒倒计时', () => {
    // 快速下甩实时窗口检测
    expect(lyricViewSource).toContain('checkFastScrollDownRealtime')
    expect(lyricViewSource).toContain('onFastScrollDown')
    // 歌词向上滑动立即隐藏
    expect(lyricViewSource).toContain('onScrollUp?.()')
    expect(playerSource).toContain('onHide={hideChrome}')
    // 唤醒入口重新开启 3s 倒计时
    expect(playerSource).toContain('onReveal={noteLyricActivity}')
    expect(playerSource).toContain('onTouchStart={noteLyricActivity}')
    expect(playerSource).toContain('onFastScrollDown={noteLyricActivity}')
  })

  it('手势与歌词动画防冲突：交互硬锁定、视口容差与宽容冷却期', () => {
    // 手指按住、拖动或惯性滚动期间硬锁定，绝不自动滚动
    expect(lyricViewSource).toContain('if (isInteractingRef.current) return')
    // 松手后的宽容视口判定：若新行仍在舒适安全区（safeTop ~ safeBottom）内，跳过滚动，仅文字原地高亮
    expect(lyricViewSource).toContain('userManualOverrideRef.current')
    expect(lyricViewSource).toContain('targetY >= safeTop && targetY <= safeBottom')
    // player 传递 controlsVisible 给 LyricView 以精准计算净视口高度
    expect(playerSource).toContain('controlsVisible={chromeVisible}')
    expect(lyricViewSource).toContain('controlsVisible?: boolean')
  })

  it('单行 LRC 严格使用整行高亮，不叠加无时间戳的虚假卡拉OK', () => {
    expect(lyricViewSource).toContain('isKaraokeLine(line: LyricLine)')
    expect(lyricViewSource).toContain('Array.isArray(line.words) && line.words.length >= 2')
  })

  it('底部控制区复用大背景与羽化渐变蒙版，遮蔽后方歌词并无缝衔接', () => {
    expect(playerSource).toContain('<LinearGradient')
    expect(playerSource).toContain("colors={['rgba(15,15,15,0)', 'rgba(15,15,15,0.72)', 'rgba(15,15,15,0.94)']}")
    expect(playerSource).toMatch(/floatingBottomControls[\s\S]*?<CoverBackdrop artwork=\{current\.artwork\}/)
  })

  it('暂无歌词时底部控制区不隐藏，空状态文案减去顶部与底部区域后居中', () => {
    expect(playerSource).toContain('hasLyrics')
    expect(playerSource).toContain('mode === \'lyrics\' && playing && hasLyrics')
    expect(playerSource).toContain('bottomSpace={220 + insets.bottom}')
    expect(lyricViewSource).toContain('bottomSpace?: number')
    expect(lyricViewSource).toMatch(/styles\.center[\s\S]*?paddingBottom:\s*bottomSpace/)
    expect(lyricViewSource).toContain('暂无歌词')
  })
})
