import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

describe('横屏播放器双联屏组件复用与架构规范', () => {
  const landscapeSource = readSource('components/player/player-landscape-view.tsx')
  const playerSource = readSource('app/player.tsx')
  const rootLayoutSource = readSource('app/_layout.tsx')
  const stackOptionsSource = readSource('lib/stack-options.ts')
  const deckSource = readSource('components/player/player-deck.tsx')
  const queueSource = readSource('components/player/player-queue.tsx')

  it('横屏播放器复用竖屏已有成熟组件（PlayerTitleRow, LyricPage, PlayerQueue, PlayerDeck, PlayerToolbar）', () => {
    expect(landscapeSource).toContain('PlayerTitleRow')
    expect(landscapeSource).toContain('PlayerDeck')
    expect(landscapeSource).toContain('PlayerToolbar')
    expect(landscapeSource).toContain('PlayerQueue')
    expect(landscapeSource).toContain('LyricPage')
    expect(landscapeSource).toContain('ViewportCover')
  })

  it('左侧为纯粹完整的独立封面舞台，带有呼吸缩放与收起按钮', () => {
    expect(landscapeSource).toContain('leftColumn')
    expect(landscapeSource).toContain('ViewportCover')
    expect(landscapeSource).toContain('coverScaleStyle')
    expect(landscapeSource).toContain('chevronDown')
    expect(landscapeSource).toContain('coverStage')
  })

  it('右侧顶部为正在播放组件(PlayerTitleRow)，不含封面', () => {
    expect(landscapeSource).toContain('<PlayerTitleRow')
    expect(landscapeSource).toContain('titleWrapper')
  })

  it('右侧中间为工作区，点击歌词或播放列表左侧封面不变，右侧在歌词与列表间平滑切换', () => {
    expect(landscapeSource).toContain("mode === 'list'")
    expect(landscapeSource).toContain("mode === 'lyrics'")
    expect(landscapeSource).toContain('workArea')
    expect(landscapeSource).toContain('hideCurrentTrack={true}')
  })

  it('模式共用父级动画并保持工作区与各图层几何稳定', () => {
    expect(landscapeSource).not.toContain('FadeIn')
    expect(landscapeSource).not.toContain('FadeOut')
    expect(landscapeSource).toContain('<View style={[StyleSheet.absoluteFill, styles.workArea]}>')
    expect(landscapeSource).toContain('active={mode === \'cover\'}')
    expect(landscapeSource).toContain('active={mode === \'list\'}')
    expect(landscapeSource).toContain('active={mode === \'lyrics\'}')
    expect(landscapeSource).toContain('top: 12 + titleHeight + 18, bottom: 44')
  })

  it('右侧下方为播放器控制台(PlayerDeck compact)，底部为工具栏(PlayerToolbar)', () => {
    expect(landscapeSource).toContain('hideTitle={true}')
    expect(landscapeSource).toContain('compact={true}')
    expect(landscapeSource).toContain('<PlayerToolbar')
    expect(deckSource).toContain('compact?: boolean')
    expect(deckSource).toContain('containerCompact')
    expect(deckSource).toContain('playControlHitCompact')
  })

  it('PlayerQueue 支持 hideCurrentTrack，横屏模式下不重复展示当前歌曲小卡片', () => {
    expect(queueSource).toContain('hideCurrentTrack?: boolean')
    expect(queueSource).toContain('showCurrentCard')
  })

  it('播放器使用不透底全屏模态，保留播放器自己的下滑退出手势', () => {
    expect(rootLayoutSource).toContain("presentation: 'fullScreenModal'")
    expect(rootLayoutSource).not.toContain("presentation: 'transparentModal'")
    expect(rootLayoutSource).toContain("getThemeColors('dark').bgPrimary")
    expect(stackOptionsSource).toContain('gestureEnabled: true')
    expect(playerSource).toContain('.onEnd((event) => {')
    expect(playerSource).toContain('runOnJS(dismiss)()')
  })

  it('player.tsx 解锁重力感应全向旋转并将模式与状态完全透传给横屏视图', () => {
    expect(playerSource).toContain('ScreenOrientation.unlockAsync()')
    expect(playerSource).toContain('ScreenOrientation.lockAsync')
    expect(playerSource).not.toContain('addOrientationChangeListener')
    expect(playerSource).toContain('mode={mode}')
    expect(playerSource).toContain('onModeChange={setMode}')
    expect(playerSource).toContain('autoHideHomeIndicator: true')
    expect(playerSource).toContain('autoHideHomeIndicator: false')
    expect(playerSource).toContain('useWindowDimensions()')
    expect(playerSource).toContain('onLayout={onViewportLayout}')
    expect(playerSource).toContain('event.nativeEvent.layout.width')
    expect(playerSource).toContain('styles.root, { width, height }')
    expect(playerSource).not.toContain('root: { flex: 1')
    expect(playerSource).toContain('key="landscape-player-canvas"')
    expect(playerSource).toContain('key="portrait-player-canvas"')
    expect(playerSource).toContain('committedStageViewportKey.current !== stageViewportKey')
    expect(playerSource).toContain('transition={coverTransition}')
    expect(playerSource).toContain('setTransitioningCoverIdentity(shouldAnimate ? coverIdentity : \'\')')
    expect(landscapeSource).toContain('viewport: { width: number; height: number; insets: EdgeInsets }')
  })
})
