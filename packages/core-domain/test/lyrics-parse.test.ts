import { describe, expect, it } from 'vitest'
import { parseLrc, parseYrc, lyricTier } from '../src/index'

describe('parseYrc（网易云逐字）', () => {
  it('解析出带 words 的行，词级时间正确', () => {
    const yrc = '[0,3020](0,580,0)难(580,580,0)以(1160,600,0)忘记\n[3020,2000](3020,500,0)初(3520,500,0)次见面'
    const lines = parseYrc(yrc)
    expect(lines).toHaveLength(2)
    expect(lines[0]!.atMs).toBe(0)
    expect(lines[0]!.text).toBe('难以忘记')
    expect(lines[0]!.words).toEqual([
      { text: '难', atMs: 0 },
      { text: '以', atMs: 580 },
      { text: '忘记', atMs: 1160 },
    ])
    expect(lyricTier({ lines, synced: true })).toBe('word')
  })

  it('跳过顶部 JSON 元数据行', () => {
    const yrc = '{"t":0,"c":[{"tx":"作词: 某某"}]}\n[100,500](100,250,0)你(350,250,0)好'
    const lines = parseYrc(yrc)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe('你好')
  })

  it('空输入返回空', () => {
    expect(parseYrc('')).toEqual([])
  })
})

describe('parseLrc（标准行级）', () => {
  it('解析毫秒/百分秒时间戳', () => {
    const lines = parseLrc('[00:29.188]故事的小黄花\n[00:32.61]从出生那年')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ atMs: 29188, text: '故事的小黄花' })
    expect(lines[1]!.atMs).toBe(32610)
    expect(lyricTier({ lines, synced: true })).toBe('line')
  })

  it('一行多个时间戳展开成多行', () => {
    const lines = parseLrc('[00:10.00][00:20.00]副歌')
    expect(lines.map((l) => l.atMs)).toEqual([10000, 20000])
    expect(lines.every((l) => l.text === '副歌')).toBe(true)
  })

  it('跳过无时间戳的元数据与空文本', () => {
    const lines = parseLrc('[ar:周杰伦]\n[00:05.00]\n[00:06.00]有词')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe('有词')
  })
})
