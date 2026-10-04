import { describe, expect, it } from 'vitest'
import { hasCode, hasNoCode } from '../support/source'

/**
 * 排序接线里最容易静默失效的一处：**换排序必须触发重新取数**。
 *
 * 排序一律交服务端（客户端不本地排序），所以选中项变了以后，只有把 `sortKey` 放进
 * `queryKey`，React Query 才会重发请求。漏了它页面不会报错，只是「点了排序没反应」——
 * 正是「不摆假按钮」要避免的那种故障。这里用源码断言把它钉死。
 */
describe('排序选中项进入 queryKey，换排序会重新取数', () => {
  it('TrackListScreen：sortKey 进 queryKey，且把 sort 透传给 fetchPage', () => {
    expect(hasCode('screens/track-list-screen.tsx', 'queryKey: [...queryKey, sortKey]')).toBe(true)
    expect(hasCode('screens/track-list-screen.tsx', 'fetchPage(page, sort)')).toBe(true)
  })

  it('专辑详情：sortKey 进 queryKey，sort 透传给 albumTracks', () => {
    expect(hasCode('screens/album-detail.tsx', "['album-tracks', connection?.id, localAlbumId, sortKey]")).toBe(true)
    expect(hasCode('screens/album-detail.tsx', 'size: 100, sort }')).toBe(true)
  })

  it.each([
    ['screens/albums.tsx', "['albums', connection?.id, sortKey]", 'provider!.albums({ page, size: PAGE_SIZE, sort })'],
    ['screens/artists.tsx', "['artists', connection?.id, sortKey]", 'provider!.artists({ page, size: 50, sort })'],
    ['screens/genres.tsx', "['genres', connection?.id, sortKey]", 'provider!.genres({ page, size: 50, sort })'],
    ['screens/playlists.tsx', "['playlists', connection?.id, sortKey]", 'provider!.playlists({ page, size: 50, sort })'],
  ])('%s：sortKey 进 queryKey 且 sort 透传', (path, keySnippet, fetchSnippet) => {
    expect(hasCode(path, keySnippet)).toBe(true)
    expect(hasCode(path, fetchSnippet)).toBe(true)
  })
})

describe('工具条只在有数的时候出现', () => {
  it('四个合集列表与曲目列表都渲染 ListToolbar', () => {
    for (const path of [
      'screens/track-list-screen.tsx',
      'screens/albums.tsx',
      'screens/artists.tsx',
      'screens/genres.tsx',
      'screens/playlists.tsx',
      'screens/album-detail.tsx',
    ]) {
      expect(hasCode(path, '<ListToolbar'), path).toBe(true)
    }
  })
})

/**
 * 排序菜单的形态是产品定的：**贴着排序图标的快捷菜单**，不是底部弹窗；
 * 菜单里**一个字段一行**，右侧用箭头表示升降序。这两条很容易在后续改动里
 * 被「顺手」改回底部弹窗 / 改成两行文字，所以在这里钉死。
 */
describe('排序是贴图标的快捷菜单，不是底部弹窗', () => {
  it('工具条先量出按钮位置，再把 anchor 交给 ListSortMenu', () => {
    expect(hasCode('components/list-toolbar.tsx', 'buttonRef.current?.measureInWindow')).toBe(true)
    expect(hasCode('components/list-toolbar.tsx', '<ListSortMenu')).toBe(true)
  })

  it('工具条不再用底部弹窗渲染排序', () => {
    expect(hasNoCode('components/list-toolbar.tsx', 'OptionPickerModal')).toBe(true)
    expect(hasNoCode('components/list-toolbar.tsx', 'ListSortSheet')).toBe(true)
  })

  it('菜单一个字段一行，右侧箭头取 arrowUp / arrowDown，点行走 applySortMenuTap', () => {
    expect(hasCode('components/list-sort-menu.tsx', 'sortMenuItems(kind, selection)')).toBe(true)
    expect(hasCode('components/list-sort-menu.tsx', "name={item.arrow === 'up' ? 'arrowUp' : 'arrowDown'}")).toBe(
      true,
    )
    expect(
      hasCode(
        'components/list-sort-menu.tsx',
        'onSelect(applySortMenuTap(kind, selection, item.field) ?? { field: item.field, order: item.order }) onClose()',
      ),
    ).toBe(true)
  })
})
