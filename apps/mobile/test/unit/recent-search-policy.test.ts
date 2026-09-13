import { describe, expect, it } from 'vitest'
import {
  addRecentKeyword,
  normalizeKeyword,
  RECENT_SEARCH_LIMIT,
  removeRecentKeyword,
  sanitizeRecentKeywords,
} from '../../src/lib/recent-search-policy'

describe('搜索历史策略', () => {
  it('关键词归一化：去掉首尾空白并把内部连续空白压成一个空格', () => {
    expect(normalizeKeyword('  周杰伦  ')).toBe('周杰伦')
    expect(normalizeKeyword('the   beatles')).toBe('the beatles')
    expect(normalizeKeyword('\t\n ')).toBe('')
  })

  it('新搜索排在最前面', () => {
    expect(addRecentKeyword(['b', 'a'], 'c')).toEqual(['c', 'b', 'a'])
  })

  it('重复搜索同一词只保留最新一条（大小写不敏感）', () => {
    expect(addRecentKeyword(['Adele', '周杰伦'], 'adele')).toEqual(['adele', '周杰伦'])
    expect(addRecentKeyword(['周杰伦', 'Adele'], ' 周杰伦 ')).toEqual(['周杰伦', 'Adele'])
  })

  it('超出上限时丢弃最旧的', () => {
    const full = Array.from({ length: RECENT_SEARCH_LIMIT }, (_, index) => `k${index}`)
    const next = addRecentKeyword(full, '新词')
    expect(next).toHaveLength(RECENT_SEARCH_LIMIT)
    expect(next[0]).toBe('新词')
    expect(next).not.toContain(`k${RECENT_SEARCH_LIMIT - 1}`)
  })

  it('空关键词不产生垃圾条目', () => {
    expect(addRecentKeyword(['a'], '   ')).toEqual(['a'])
    expect(addRecentKeyword([], '')).toEqual([])
  })

  it('删除是大小写不敏感的，且只删匹配项', () => {
    expect(removeRecentKeyword(['Adele', '周杰伦'], 'ADELE')).toEqual(['周杰伦'])
    expect(removeRecentKeyword(['a'], '不存在')).toEqual(['a'])
  })

  it('清洗存储脏数据：过滤非字符串、空串与重复项，并裁到上限', () => {
    const raw = ['周杰伦', 42, '', '   ', null, { x: 1 }, '周杰伦', 'adele']
    expect(sanitizeRecentKeywords(raw)).toEqual(['周杰伦', 'adele'])
    expect(sanitizeRecentKeywords('不是数组')).toEqual([])
    expect(sanitizeRecentKeywords(Array.from({ length: 30 }, (_, i) => `k${i}`))).toHaveLength(RECENT_SEARCH_LIMIT)
  })
})
