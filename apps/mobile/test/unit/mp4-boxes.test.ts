import { describe, expect, it } from 'vitest'
import { countBoxes, firstBoxType, scanTopLevelBoxes } from '../../src/player/mp4-boxes'

/** 造一个顶层 box：4 字节大端长度 + 4 字节类型 + 若干填充 */
function box(type: string, payloadBytes = 4): Uint8Array {
  const size = 8 + payloadBytes
  const bytes = new Uint8Array(size)
  bytes[0] = (size >>> 24) & 0xff
  bytes[1] = (size >>> 16) & 0xff
  bytes[2] = (size >>> 8) & 0xff
  bytes[3] = size & 0xff
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index)
  return bytes
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

describe('MP4 顶层 box 扫描', () => {
  it('识别 ftyp / moov，并数出 moof 与 mdat 的个数', () => {
    // 结构对齐真实转码产物：ftyp + moov + N×(styp + sidx + moof + mdat)
    const bytes = concat([
      box('ftyp'),
      box('moov', 32),
      box('styp'),
      box('sidx'),
      box('moof'),
      box('mdat', 64),
      box('styp'),
      box('sidx'),
      box('moof'),
      box('mdat', 64),
    ])
    expect(firstBoxType(bytes)).toBe('ftyp')
    expect(countBoxes(bytes, 'moof')).toBe(2)
    expect(countBoxes(bytes, 'mdat')).toBe(2)
    expect(scanTopLevelBoxes(bytes).truncated).toBe(false)
  })

  it('空 buffer 得到 0 个 box，且不算被截断', () => {
    const result = scanTopLevelBoxes(new Uint8Array(0))
    expect(result.boxes).toEqual([])
    expect(result.truncated).toBe(false)
    expect(firstBoxType(new Uint8Array(0))).toBeUndefined()
  })

  it('box 长度声明越界时标记为被截断（下载被截断的文件就是这样）', () => {
    const bytes = concat([box('ftyp'), box('moof', 1000)])
    // 只留前 20 字节，让第二个 box 的声明长度超出实际
    const truncated = bytes.slice(0, 20)
    const result = scanTopLevelBoxes(truncated)
    expect(result.truncated).toBe(true)
    expect(result.boxes.map((item) => item.type)).toEqual(['ftyp'])
  })

  it('长度小于 8 的非法 box 立即停止', () => {
    const bytes = new Uint8Array(16)
    // 第一个 box 声明长度 0（非法）
    bytes[4] = 'f'.charCodeAt(0)
    bytes[5] = 't'.charCodeAt(0)
    bytes[6] = 'y'.charCodeAt(0)
    bytes[7] = 'p'.charCodeAt(0)
    expect(scanTopLevelBoxes(bytes).truncated).toBe(true)
  })

  it('尾部不足 8 字节的残余也算被截断', () => {
    const bytes = concat([box('ftyp'), new Uint8Array(5)])
    expect(scanTopLevelBoxes(bytes).truncated).toBe(true)
  })

  it('空分片（只含 styp）的 moof 数为 0 —— 这是判据里必须容忍的情况', () => {
    // 实测：音频正好落在分片边界上时，尾片只有 24 字节、不含 moof
    const emptySegment = concat([box('styp')])
    expect(countBoxes(emptySegment, 'moof')).toBe(0)
  })
})
