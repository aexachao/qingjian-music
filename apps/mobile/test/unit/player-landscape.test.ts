import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

describe('横屏播放器双联屏组件复用与架构规范', () => {
  const landscapeSource = readSource('components/player/player-landscape-view.tsx')
  const playerSource = readSource('app/player.tsx')
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

  it('player.tsx 解锁重力感应全向旋转并将模式与状态完全透传给横屏视图', () => {
    expect(playerSource).toContain('ScreenOrientation.unlockAsync()')
    expect(playerSource).toContain('ScreenOrientation.lockAsync')
    expect(playerSource).toContain('mode={mode}')
    expect(playerSource).toContain('onModeChange={setMode}')
  })
})
