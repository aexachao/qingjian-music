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

  it('保留零时刻 JSON 信息行并保持正文时间轴', () => {
    const yrc = '{"t":0,"c":[{"tx":"作词: 某某"}]}\n[100,500](100,250,0)你(350,250,0)好'
    const lines = parseYrc(yrc)
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text).toBe('作词: 某某')
    expect(lines[0]!.atMs).toBe(0)
    expect(lines[1]!.text).toBe('你好')
    expect(lines[1]!.atMs).toBe(100)
  })

  it('keeps valid JSON timestamps and leaves absent or invalid timestamps untimed', () => {
    const lines = parseYrc([
      '{"t":0,"c":[{"tx":"前奏"}]}',
      '{"t":1500,"c":[{"tx":"演唱：甲"}]}',
      '{"t":-1,"c":[{"tx":"作曲：乙"}]}',
      '{"t":"2000","c":[{"tx":"作词：丙"}]}',
      '{"c":[{"tx":"编曲：丁"}]}',
    ].join('\n'))
    expect(lines.map(({ atMs, text }) => [atMs, text])).toEqual([
      [-99999, '作曲：乙'],
      [-99998, '作词：丙'],
      [-99997, '编曲：丁'],
      [0, '前奏'],
      [1500, '演唱：甲'],
    ])
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

  it('解析元数据并赋予极小时间戳，跳过空文本', () => {
    const lines = parseLrc('[ar:周杰伦]\n[00:05.00]\n[00:06.00]有词')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text).toBe('歌手：周杰伦')
    expect(lines[0]!.atMs).toBeLessThan(0)
    expect(lines[1]!.text).toBe('有词')
  })

  it('preserves LRC credits as untimed rows while keeping timed JSON metadata seekable', () => {
    const lines = parseLrc('[ar:歌手]\n{"t":0,"c":[{"tx":"前奏"}]}\n[00:05.00]正文')
    expect(lines.map(({ atMs, text }) => [atMs, text])).toEqual([
      [-99999, '歌手：歌手'],
      [0, '前奏'],
      [5000, '正文'],
    ])
  })
})

 it('preserves credit tags, excludes file authors/technical tags, and tolerates malformed JSON', () => {
  const lines = parseLrc('[作词:甲]\n[composer:乙]\n[ar:丙]\n[by:文件制作者]\n[offset:200]\n[00:01]正文')
  expect(lines.map((line) => line.text)).toEqual(['作词：甲', '作曲：乙', '歌手：丙', '正文'])
  const yrc = '{bad json}\n{"c":[{"tx":"演唱："},{"tx":"丙"},null,{}]}\n[100,400](100,200,0)正(300,200,0)文'
  expect(parseYrc(yrc).map((line) => line.text)).toEqual(['演唱：丙', '正文'])
 })
