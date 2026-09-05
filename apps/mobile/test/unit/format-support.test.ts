import { describe, expect, it } from 'vitest'
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
