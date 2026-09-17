import { describe, expect, it } from 'vitest'
import type { Track } from '@qj/core-domain'
import { formatAlbumYear, getAlbumAudioSpecBadge } from '@/lib/album-meta'

const makeTrack = (audio?: Track['audio']): Track => ({
  id: 't-1',
  title: 'Track 1',
  durationMs: 180000,
  artists: [],
  genres: [],
  isCue: false,
  audio,
})

describe('getAlbumAudioSpecBadge', () => {
  it('空列表或无音频规格返回 undefined', () => {
    expect(getAlbumAudioSpecBadge([])).toBeUndefined()
    expect(getAlbumAudioSpecBadge([makeTrack(undefined)])).toBeUndefined()
  })

  it('bitDepth >= 24 判定为 Hi-Res', () => {
    const tracks = [makeTrack({ bitDepth: 24, sampleRateHz: 44100, format: 'flac' })]
    expect(getAlbumAudioSpecBadge(tracks)).toBe('Hi-Res')
  })

  it('sampleRateHz >= 88200 判定为 Hi-Res', () => {
    const tracks = [makeTrack({ bitDepth: 16, sampleRateHz: 96000, format: 'flac' })]
    expect(getAlbumAudioSpecBadge(tracks)).toBe('Hi-Res')
  })

  it('普通 16bit/44.1kHz FLAC 判定为无损', () => {
    const tracks = [makeTrack({ bitDepth: 16, sampleRateHz: 44100, format: 'flac' })]
    expect(getAlbumAudioSpecBadge(tracks)).toBe('无损')
  })

  it('MP3 等有损格式返回 undefined', () => {
    const tracks = [makeTrack({ bitDepth: 16, sampleRateHz: 44100, format: 'mp3' })]
    expect(getAlbumAudioSpecBadge(tracks)).toBeUndefined()
  })

  it('多音轨只要有一首达到 Hi-Res 则以 Hi-Res 为准', () => {
    const tracks = [
      makeTrack({ bitDepth: 16, sampleRateHz: 44100, format: 'mp3' }),
      makeTrack({ bitDepth: 24, sampleRateHz: 96000, format: 'flac' }),
    ]
    expect(getAlbumAudioSpecBadge(tracks)).toBe('Hi-Res')
  })
})

describe('formatAlbumYear', () => {
  it('正确提取 4 位年份并添加「年」后缀', () => {
    expect(formatAlbumYear('2022-07-15')).toBe('2022 年')
    expect(formatAlbumYear('2020')).toBe('2020 年')
    expect(formatAlbumYear('1998-01-01T00:00:00Z')).toBe('1998 年')
  })

  it('非法或空值返回 undefined', () => {
    expect(formatAlbumYear(undefined)).toBeUndefined()
    expect(formatAlbumYear('')).toBeUndefined()
    expect(formatAlbumYear('unknown')).toBeUndefined()
  })
})
