import { describe, expect, it } from 'vitest'
import type { Track } from '@qj/core-domain'
import { getTrackFormatTag } from '../../src/lib/format-tag'
import { needsTranscode } from '../../src/player/format-support'

describe('是否需要服务端转码', () => {
  it('原生能解的格式直推', () => {
    for (const format of ['flac', 'FLAC', 'wav', 'mp3', 'm4a', 'aac', 'alac', 'aiff']) {
      expect(needsTranscode(format)).toBe(false)
    }
  })

  it('原生解不了的格式必须转码（这套曲库里 WMA 占约 5%）', () => {
    for (const format of ['wma', 'ape', 'dsf', 'dff', 'tak', 'tta', 'wv', 'ogg', 'opus']) {
      expect(needsTranscode(format)).toBe(true)
    }
  })

  it('格式未知时先按原生播，播失败再强制转码', () => {
    expect(needsTranscode(undefined)).toBe(false)
    expect(needsTranscode('')).toBe(false)
  })
})

describe('音频格式 Tag 提取', () => {
  const baseTrack: Track = {
    id: 't1',
    title: 'Song',
    durationMs: 180000,
    artists: [],
    genres: [],
    isCue: false,
  }

  it('优先从 audio.format 提取标准大写格式标签', () => {
    expect(getTrackFormatTag({ ...baseTrack, audio: { format: 'flac' } })).toBe('FLAC')
    expect(getTrackFormatTag({ ...baseTrack, audio: { format: 'mp3' } })).toBe('MP3')
    expect(getTrackFormatTag({ ...baseTrack, audio: { format: 'wav' } })).toBe('WAV')
    expect(getTrackFormatTag({ ...baseTrack, audio: { format: 'alac' } })).toBe('ALAC')
  })

  it('支持从 path 后缀或 container 兜底提取', () => {
    expect(getTrackFormatTag({ ...baseTrack, audio: { path: '/music/song.flac' } })).toBe('FLAC')
    expect(getTrackFormatTag({ ...baseTrack, audio: { container: 'dsf' } })).toBe('DSF')
  })

  it('无格式或过长格式时优雅返回 undefined', () => {
    expect(getTrackFormatTag(baseTrack)).toBeUndefined()
    expect(getTrackFormatTag({ ...baseTrack, audio: { format: 'somethingtoolong' } })).toBeUndefined()
  })
})
