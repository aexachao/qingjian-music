import { describe, expect, it } from 'vitest'
import type { QueueItem } from '@qj/core-domain'
import { formatAudioSourceInfo } from '../../src/lib/audio-info'
import { usePlayerStore } from '../../src/player/store'
import { readSource } from '../support/source'

const baseItem: QueueItem = {
  qid: 'srv:track1:1',
  serverId: 'srv',
  trackId: 'track1',
  title: '测试曲目',
  artistText: '测试歌手',
  durationMs: 180000,
}

describe('播放页音源规格信息展示 (formatAudioSourceInfo)', () => {
  it('原文件无损歌曲正确展示：原文件 · FLAC · 716 kbps', () => {
    const item: QueueItem = {
      ...baseItem,
      format: 'flac',
      bitrateBps: 716000,
    }
    expect(formatAudioSourceInfo(item)).toBe('原文件 · FLAC · 716 kbps')
  })

  it('需要服务端解码的格式正确展示：服务端解码 · WMA · 960 kbps', () => {
    const item: QueueItem = {
      ...baseItem,
      format: 'wma',
      bitrateBps: 960000,
    }
    expect(formatAudioSourceInfo(item)).toBe('服务端解码 · WMA · 960 kbps')
  })

  it('当 bitrateBps 缺失但拥有文件尺寸与时长时自动推导码率', () => {
    // 8,000,000 bytes * 8 = 64,000,000 bits / 200s = 320,000 bps = 320 kbps
    const item: QueueItem = {
      ...baseItem,
      format: 'mp3',
      sizeBytes: 8000000,
      durationMs: 200000,
    }
    expect(formatAudioSourceInfo(item)).toBe('原文件 · MP3 · 320 kbps')
  })

  it('DSF / DSD 等格式大写归一化且标记为服务端解码', () => {
    const item: QueueItem = {
      ...baseItem,
      format: 'dsf',
      bitrateBps: 5644800,
    }
    expect(formatAudioSourceInfo(item)).toBe('服务端解码 · DSF · 5645 kbps')
  })
})

describe('播放与转码 Loading 状态与 UI 契约', () => {
  it('store 管理音频加载态 (isLoadingAudio)', () => {
    usePlayerStore.getState().setIsLoadingAudio(true)
    expect(usePlayerStore.getState().isLoadingAudio).toBe(true)

    usePlayerStore.getState().setIsLoadingAudio(false)
    expect(usePlayerStore.getState().isLoadingAudio).toBe(false)

    usePlayerStore.getState().setIsLoadingAudio(true)
    usePlayerStore.getState().clear()
    expect(usePlayerStore.getState().isLoadingAudio).toBe(false)
  })

  it('全屏播放器 (PlayerDeck) 将音源信息直接嵌入开始/结束时间中间，并为播放按钮接入 loading', () => {
    const deckSource = readSource('components/player/player-deck.tsx')
    expect(deckSource).toContain('<ProgressBar')
    expect(deckSource).toContain('centerLabel={audioSourceInfo}')
    expect(deckSource).toContain('formatAudioSourceInfo(current)')
    expect(deckSource).toContain('loading={isAudioLoading}')

    const progressSource = readSource('components/progress-bar.tsx')
    expect(progressSource).toContain('centerLabel?: string')
    expect(progressSource).toContain('centerInfo')
    expect(progressSource).toContain('{centerLabel}')
  })

  it('迷你播放器 (MiniPlayer) 为播放/暂停按钮接入 loading', () => {
    const miniSource = readSource('components/mini-player.tsx')
    expect(miniSource).toContain('useIsAudioLoading')
    expect(miniSource).toContain('loading={isAudioLoading}')
  })

  it('IconButton 支持 loading 态并渲染 ActivityIndicator', () => {
    const iconSource = readSource('components/icon.tsx')
    expect(iconSource).toContain('loading?: boolean')
    expect(iconSource).toContain('<ActivityIndicator')
  })
})
