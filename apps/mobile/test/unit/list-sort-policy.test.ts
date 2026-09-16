import { describe, expect, it } from 'vitest'
import {
  applySortMenuTap,
  arrowFor,
  canSort,
  countText,
  defaultSortSelection,
  LIST_SORT,
  sortFieldLabel,
  sortMenuItems,
  sortSpecFor,
  type ListKind,
  type SortSelection,
} from '../../src/lib/list-sort-policy'

/**
 * 这张表是 2026-09-15 真实 NAS 只读实测的结论（判据：响应 `data.sort` 是否回显请求值；
 * 歌单详情用「升降序互为倒序」的行为探针），抄自
 * `docs/执行计划-2026-09-15.md`「第 1 轮 · 探路结论 / 补测记录」。**改策略前先重测**。
 *
 * 断言两件事：
 *   1. 选项里的字段都在实测认可的集合里（不能凭感觉加字段）；
 *   2. 空数组的语义就是「服务端不支持」，界面据此不渲染按钮。
 */
const SUPPORTED_FIELDS: Record<ListKind, readonly string[]> = {
  allTracks: ['createdAt', 'title'],
  recentAdded: ['createdAt', 'title'],
  favorites: ['favoriteAt', 'title'],
  recentPlayed: [],
  searchTracks: [],
  albums: ['name', 'artistName', 'trackCount', 'newTrackAddedAt'],
  artists: ['name', 'trackCount', 'albumCount'],
  genres: ['name', 'trackCount'],
  playlists: [],
  albumTracks: ['title', 'trackNo'],
  genreTracks: ['createdAt'],
  // 实测只认 title（详见 list-sort-policy.ts 注释）；只有一个字段 → 不给按钮，options 为空
  playlistTracks: ['title'],
}

const KINDS = Object.keys(SUPPORTED_FIELDS) as ListKind[]

describe('排序选项只列服务端实测认的字段', () => {
  it.each(KINDS)('%s 的每个选项字段都在实测集合里', (kind) => {
    const allowed = SUPPORTED_FIELDS[kind]
    for (const option of LIST_SORT[kind].options) {
      expect(allowed, `${kind} 的选项字段 ${option.field}`).toContain(option.field)
    }
  })

  it.each(KINDS)('%s 的字段不重复', (kind) => {
    const fields = LIST_SORT[kind].options.map((option) => option.field)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it.each(KINDS)('%s 的默认方向都是 asc / desc 之一', (kind) => {
    for (const option of LIST_SORT[kind].options) {
      expect(['asc', 'desc'], `${kind}/${option.field}`).toContain(option.defaultOrder)
    }
  })
})

describe('不摆假按钮：支持不了的接口不放排序按钮', () => {
  it('最近播放、歌单列表、搜索歌曲完全没有排序选项', () => {
    expect(LIST_SORT.recentPlayed.options).toHaveLength(0)
    expect(LIST_SORT.playlists.options).toHaveLength(0)
    expect(LIST_SORT.searchTracks.options).toHaveLength(0)
  })

  it('流派详情支持升降序切换显示排序按钮，歌单详情不摆按钮', () => {
    expect(LIST_SORT.genreTracks.options).toHaveLength(1)
    expect(canSort('genreTracks')).toBe(true)
    expect(canSort('playlistTracks')).toBe(false)
  })

  it.each(['recentPlayed', 'playlists', 'searchTracks', 'playlistTracks'] as const)(
    '%s 不渲染排序按钮',
    (kind) => {
      expect(canSort(kind)).toBe(false)
    },
  )

  it.each(['allTracks', 'recentAdded', 'favorites', 'albums', 'artists', 'genres', 'albumTracks', 'genreTracks'] as const)(
    '%s 渲染排序按钮',
    (kind) => {
      expect(canSort(kind)).toBe(true)
    },
  )
})

describe('两条拍板的文案 / 字段差异', () => {
  it('专辑「加入时间」用服务端的 newTrackAddedAt，不是 updatedAt', () => {
    const added = LIST_SORT.albums.options.find((option) => option.field === 'newTrackAddedAt')
    expect(added?.label).toBe('加入时间')
  })

  it('专辑不提供「发行年份」（服务端忽略 releaseDate）', () => {
    const fields = LIST_SORT.albums.options.map((option) => option.field)
    expect(fields).not.toContain('releaseDate')
    expect(fields).not.toContain('updatedAt')
    const labels = LIST_SORT.albums.options.map((option) => option.label)
    expect(labels).not.toContain('发行年份')
    expect(labels).not.toContain('更新日期')
  })

  it('「我喜欢的音乐」用服务端的 favoriteAt 而不是通用 createdAt', () => {
    expect(LIST_SORT.favorites.options.map((option) => option.field)).toContain('favoriteAt')
  })
})

describe('默认选择 = 首字段 + 服务端默认方向（首屏顺序不变）', () => {
  it.each(['allTracks', 'favorites', 'albums', 'artists', 'genres', 'albumTracks'] as const)(
    '%s 的默认选择命中第一个字段',
    (kind) => {
      const first = LIST_SORT[kind].options[0]
      expect(defaultSortSelection(kind)).toEqual({ field: first.field, order: first.defaultOrder })
    },
  )

  it('没有可排字段的列表没有默认选择', () => {
    expect(defaultSortSelection('recentPlayed')).toBeUndefined()
    expect(defaultSortSelection('playlists')).toBeUndefined()
  })
})

describe('快捷菜单：一个字段一行，右侧箭头表示升降序', () => {
  it('行数 = 字段数（升序/降序不摊成两个选项）', () => {
    for (const kind of KINDS) {
      expect(sortMenuItems(kind, undefined)).toHaveLength(LIST_SORT[kind].options.length)
    }
  })

  it('未选中时每行用自己的服务端默认方向，升序朝上、降序朝下', () => {
    const rows = sortMenuItems('allTracks', undefined)
    expect(rows.map((row) => [row.label, row.order, row.arrow, row.active])).toEqual([
      ['添加日期', 'desc', 'down', false],
      ['歌曲名', 'asc', 'up', false],
    ])
  })

  it('只有当前字段 active，且箭头跟着用户选的方向走', () => {
    const rows = sortMenuItems('allTracks', { field: 'createdAt', order: 'asc' })
    expect(rows.find((row) => row.field === 'createdAt')).toMatchObject({ active: true, order: 'asc', arrow: 'up' })
    expect(rows.find((row) => row.field === 'title')).toMatchObject({ active: false, order: 'asc' })
  })

  it('arrowFor：asc → up，desc → down', () => {
    expect(arrowFor('asc')).toBe('up')
    expect(arrowFor('desc')).toBe('down')
  })
})

describe('点一行：切字段用默认方向，点同一行翻转方向', () => {
  it('点当前字段 → 翻方向', () => {
    expect(applySortMenuTap('allTracks', { field: 'title', order: 'asc' }, 'title')).toEqual({
      field: 'title',
      order: 'desc',
    })
    expect(applySortMenuTap('allTracks', { field: 'title', order: 'desc' }, 'title')).toEqual({
      field: 'title',
      order: 'asc',
    })
  })

  it('点别的字段 → 切过去并用该字段的默认方向', () => {
    expect(applySortMenuTap('albums', { field: 'name', order: 'asc' }, 'newTrackAddedAt')).toEqual({
      field: 'newTrackAddedAt',
      order: 'desc',
    })
  })

  it('白名单外的字段不动现状（不发明字段）', () => {
    const current: SortSelection = { field: 'title', order: 'asc' }
    expect(applySortMenuTap('allTracks', current, 'year')).toEqual(current)
    expect(applySortMenuTap('recentPlayed', undefined, 'createdAt')).toBeUndefined()
  })
})

describe('取 spec / 文案 / 计数', () => {
  it('sortSpecFor 用用户选的方向，字段必须名副其实', () => {
    expect(sortSpecFor('allTracks', { field: 'title', order: 'asc' })).toEqual({ field: 'title', order: 'asc' })
    // 同一字段可以选相反方向
    expect(sortSpecFor('allTracks', { field: 'title', order: 'desc' })).toEqual({ field: 'title', order: 'desc' })
  })

  it('sortSpecFor 不发明字段：白名单外的字段返回 undefined', () => {
    expect(sortSpecFor('allTracks', { field: 'year', order: 'desc' })).toBeUndefined()
    expect(sortSpecFor('recentPlayed', { field: 'createdAt', order: 'desc' })).toBeUndefined()
    expect(sortSpecFor('allTracks', undefined)).toBeUndefined()
  })

  it('sortFieldLabel 给出字段可读名（无障碍标签要用）', () => {
    expect(sortFieldLabel('albums', 'newTrackAddedAt')).toBe('加入时间')
    expect(sortFieldLabel('albums', 'nope')).toBeUndefined()
  })

  it.each([
    ['allTracks', '共 41198 首'],
    ['albums', '共 11486 张'],
    ['artists', '共 5510 位'],
    ['genres', '共 101 个'],
  ] as const)('countText(%s, n) 单位正确', (kind, expected) => {
    const total = Number(expected.match(/\d+/)?.[0])
    expect(countText(kind, total)).toBe(expected)
  })
})
