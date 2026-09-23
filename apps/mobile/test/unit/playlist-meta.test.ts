import { describe, expect, it } from 'vitest'
import {
  formatPlaylistDuration,
  formatPlayableDurationText,
  resolvePlaylistCover,
} from '@/lib/playlist-meta'

describe('formatPlaylistDuration', () => {
  it('处理空值或非法输入', () => {
    expect(formatPlaylistDuration(undefined)).toBe('')
    expect(formatPlaylistDuration(0)).toBe('')
    expect(formatPlaylistDuration(-1000)).toBe('')
    expect(formatPlaylistDuration(NaN)).toBe('')
  })

  it('不足 1 分钟取 1 分钟', () => {
    expect(formatPlaylistDuration(10_000)).toBe('1 分钟')
    expect(formatPlaylistDuration(45_000)).toBe('1 分钟')
  })

  it('1 小时以内格式化为 X 分钟', () => {
    expect(formatPlaylistDuration(60_000)).toBe('1 分钟')
    expect(formatPlaylistDuration(150_000)).toBe('3 分钟')
    expect(formatPlaylistDuration(45 * 60 * 1000)).toBe('45 分钟')
    expect(formatPlaylistDuration(59 * 60 * 1000)).toBe('59 分钟')
  })

  it('整小时格式化为 X 小时', () => {
    expect(formatPlaylistDuration(60 * 60 * 1000)).toBe('1 小时')
    expect(formatPlaylistDuration(2 * 60 * 60 * 1000)).toBe('2 小时')
  })

  it('多小时多分钟组合', () => {
    expect(formatPlaylistDuration((60 + 12) * 60 * 1000)).toBe('1 小时 12 分钟')
    expect(formatPlaylistDuration((2 * 60 + 45) * 60 * 1000)).toBe('2 小时 45 分钟')
  })

  it('超过 24 小时格式化为天/小时/分钟组合', () => {
    // 整天
    expect(formatPlaylistDuration(24 * 60 * 60 * 1000)).toBe('1 天')
    expect(formatPlaylistDuration(48 * 60 * 60 * 1000)).toBe('2 天')
    // 天 + 小时
    expect(formatPlaylistDuration(26 * 60 * 60 * 1000)).toBe('1 天 2 小时')
    // 天 + 分钟
    expect(formatPlaylistDuration((24 * 60 + 15) * 60 * 1000)).toBe('1 天 15 分钟')
    // 天 + 小时 + 分钟
    expect(formatPlaylistDuration((26 * 60 + 30) * 60 * 1000)).toBe('1 天 2 小时 30 分钟')
  })
})

describe('formatPlayableDurationText', () => {
  it('处理空值或非法输入返回空字符串', () => {
    expect(formatPlayableDurationText(undefined)).toBe('')
    expect(formatPlayableDurationText(0)).toBe('')
  })

  it('有效时长追加「可播 」前缀', () => {
    expect(formatPlayableDurationText(45 * 60 * 1000)).toBe('可播 45 分钟')
    expect(formatPlayableDurationText((60 + 20) * 60 * 1000)).toBe('可播 1 小时 20 分钟')
    expect(formatPlayableDurationText((26 * 60 + 30) * 60 * 1000)).toBe('可播 1 天 2 小时 30 分钟')
  })
})

describe('resolvePlaylistCover', () => {
  it('优先使用歌单自身的 coverId', () => {
    expect(
      resolvePlaylistCover({
        playlistCoverId: 'cover-playlist',
        initialCoverId: 'cover-initial',
        firstTrackCoverId: 'cover-track',
      }),
    ).toBe('cover-playlist')
  })

  it('歌单自身无 coverId 时回退到 initialCoverId', () => {
    expect(
      resolvePlaylistCover({
        playlistCoverId: '',
        initialCoverId: 'cover-initial',
        firstTrackCoverId: 'cover-track',
      }),
    ).toBe('cover-initial')

    expect(
      resolvePlaylistCover({
        playlistCoverId: undefined,
        initialCoverId: 'cover-initial',
        firstTrackCoverId: 'cover-track',
      }),
    ).toBe('cover-initial')
  })

  it('两者皆无时回退到第一首曲目的封面', () => {
    expect(
      resolvePlaylistCover({
        playlistCoverId: undefined,
        initialCoverId: undefined,
        firstTrackCoverId: 'cover-track-1',
      }),
    ).toBe('cover-track-1')
  })

  it('全部为空时返回 undefined（触发 BrandMark 兜底）', () => {
    expect(
      resolvePlaylistCover({
        playlistCoverId: undefined,
        initialCoverId: '',
        firstTrackCoverId: undefined,
      }),
    ).toBeUndefined()
  })
})
