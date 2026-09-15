import { describe, expect, it } from 'vitest'
import { clampSearchTabKey, searchTabLabel, searchTabs } from '../../src/lib/search-tabs'
import { isTabBarHidden } from '../../src/lib/tab-bar-policy'

describe('搜索结果页签：只按能力裁剪，不按命中数裁剪', () => {
  it('歌单能力存在时四个页签都在，顺序固定', () => {
    expect(searchTabs({ canSearchPlaylists: true }).map((tab) => tab.key)).toEqual([
      'tracks',
      'albums',
      'artists',
      'playlists',
    ])
  })

  it('后端没有 searchPlaylists 时只去掉歌单页签', () => {
    expect(searchTabs({ canSearchPlaylists: false }).map((tab) => tab.key)).toEqual([
      'tracks',
      'albums',
      'artists',
    ])
  })

  it('歌曲页签不受任何能力影响（永远至少有一个页签）', () => {
    expect(searchTabs({ canSearchPlaylists: false })[0]?.key).toBe('tracks')
  })

  it('页签文案用于标题与空态，取不到时给空串而不是 undefined', () => {
    const tabs = searchTabs({ canSearchPlaylists: true })
    expect(searchTabLabel(tabs, 'albums')).toBe('专辑')
    expect(searchTabLabel(tabs, 'playlists')).toBe('歌单')
    expect(searchTabLabel(searchTabs({ canSearchPlaylists: false }), 'playlists')).toBe('')
  })
})

describe('当前页签的兜底', () => {
  it('在集合里就原样保留', () => {
    const tabs = searchTabs({ canSearchPlaylists: true })
    expect(clampSearchTabKey(tabs, 'artists')).toBe('artists')
  })

  it('不在集合里（能力变了 / 传了已下线的类目）就落到第一个', () => {
    const tabs = searchTabs({ canSearchPlaylists: false })
    expect(clampSearchTabKey(tabs, 'playlists')).toBe('tracks')
    expect(clampSearchTabKey(tabs, undefined)).toBe('tracks')
  })
})

describe('Tab 栏可见性：只有搜索态藏栏', () => {
  it('搜索态藏栏', () => {
    expect(isTabBarHidden(['(tabs)', 'search', 'query'])).toBe(true)
  })

  it('搜索页签的浏览态与详情页都不藏', () => {
    expect(isTabBarHidden(['(tabs)', 'search'])).toBe(false)
    expect(isTabBarHidden(['(tabs)', 'search', 'album', '[id]'])).toBe(false)
  })

  it('其它页签不藏', () => {
    expect(isTabBarHidden(['(tabs)', 'home'])).toBe(false)
    expect(isTabBarHidden(['(tabs)', 'library', 'albums'])).toBe(false)
  })
})
