import type { SortSpec } from '@qj/core-domain'

/**
 * 列表排序选项与计数单位（纯逻辑，不 import react-native / expo，可直接单测）。
 *
 * ── 为什么选项必须逐条对账 ──────────────────────────────────────────────────
 * 选项**只能**是服务端真的接受的字段。判据是 2026-09-15 在真实 NAS 上的只读实测：
 * 请求带 `sort=<字段>,<方向>`，看响应里的 `data.sort` 是否**回显**请求值 ——
 * 不接受就回显接口默认值（有的接口连默认值都不回，即完全不支持）。
 * 完整清单见 `docs/执行计划-2026-09-15.md`「第 1 轮 · 探路结论 / 补测记录」。
 *
 * 摆一个点了没反应的选项就是假按钮，所以：
 *   · `options` 为空 → 服务端完全不支持排序（最近播放、歌单列表），界面不渲染按钮；
 *   · `options` 只有一项 → 没有可选项，界面同样不渲染按钮（流派详情、歌单详情）。
 *
 * ── 字段与方向是**分开**的 ─────────────────────────────────────────────────
 * 界面里**一个字段就是一行**（不把「升序」「降序」摊成两个选项），行的右侧用箭头
 * （↑ 升序 / ↓ 降序）表示这一行代表的方向；再点同一行就翻方向。所以这里存的是
 * 字段 + 方向两件事，方向单独带。每个字段的 `defaultOrder` = 服务端默认方向，
 * 保证首屏顺序和改动前一致。
 *
 * ── 文本排序为什么不在本地排 ────────────────────────────────────────────────
 * 服务端用自己的 collation（大小写不敏感、拉丁在前、CJK 在后）。本地复刻必不一致，
 * 而且分页之下客户端只能排「已加载的那几页」。所以排序一律交服务端：
 * 客户端只负责把字段名与方向传下去。
 */

export type SortOrder = 'asc' | 'desc'

export type ListKind =
  | 'allTracks' // 全部歌曲
  | 'recentAdded' // 最近添加
  | 'favorites' // 我喜欢的音乐
  | 'recentPlayed' // 最近播放（服务端不支持排序）
  | 'searchTracks' // 搜索结果 · 歌曲（未实测，先不给排序）
  | 'albums' // 专辑
  | 'artists' // 艺术家
  | 'genres' // 流派
  | 'playlists' // 歌单（服务端不支持排序）
  | 'albumTracks' // 专辑详情
  | 'genreTracks' // 流派详情（只有一个可排字段）
  | 'playlistTracks' // 歌单详情（只有一个可排字段）

export interface SortField {
  /** 服务端认的字段名 */
  field: string
  label: string
  /** 进页面时的方向（= 服务端默认），必须先于另一个方向展示 */
  defaultOrder: SortOrder
}

export interface SortSelection {
  field: string
  order: SortOrder
}

export interface ListSortConfig {
  /** 计数单位：共 X「首 / 张 / 位 / 个」 */
  unit: string
  /** 空数组 = 服务端不支持排序；第一项同时是默认字段 */
  options: readonly SortField[]
}

export const LIST_SORT: Record<ListKind, ListSortConfig> = {
  allTracks: {
    unit: '首',
    options: [
      { field: 'createdAt', label: '添加日期', defaultOrder: 'desc' },
      { field: 'title', label: '歌曲名', defaultOrder: 'asc' },
    ],
  },
  recentAdded: {
    unit: '首',
    options: [
      { field: 'createdAt', label: '添加日期', defaultOrder: 'desc' },
      { field: 'title', label: '歌曲名', defaultOrder: 'asc' },
    ],
  },
  favorites: {
    unit: '首',
    options: [
      { field: 'favoriteAt', label: '收藏时间', defaultOrder: 'desc' },
      { field: 'title', label: '歌曲名', defaultOrder: 'asc' },
    ],
  },
  // 实测 /play-history/list 对任何 sort 字段都回显空 —— 完全不支持排序
  recentPlayed: { unit: '首', options: [] },
  // 搜索接口的排序未实测，先不给（宁可不放，也不摆假按钮）
  searchTracks: { unit: '首', options: [] },
  albums: {
    unit: '张',
    options: [
      // 服务端字段是 newTrackAddedAt（新歌加入该专辑的时间）。文案写「加入时间」，
      // 不许写「更新日期」—— 那不是这个字段的含义，且 updatedAt 服务端根本不认。
      { field: 'newTrackAddedAt', label: '加入时间', defaultOrder: 'desc' },
      { field: 'name', label: '专辑名', defaultOrder: 'asc' },
      { field: 'artistName', label: '歌手名', defaultOrder: 'asc' },
      { field: 'trackCount', label: '歌曲数量', defaultOrder: 'desc' },
    ],
  },
  artists: {
    unit: '位',
    options: [
      { field: 'trackCount', label: '歌曲数量', defaultOrder: 'desc' },
      { field: 'name', label: '名字', defaultOrder: 'asc' },
      { field: 'albumCount', label: '专辑数量', defaultOrder: 'desc' },
    ],
  },
  genres: {
    unit: '个',
    options: [
      { field: 'trackCount', label: '歌曲数量', defaultOrder: 'desc' },
      { field: 'name', label: '风格名', defaultOrder: 'asc' },
    ],
  },
  // 实测 /playlist/list 连默认 sort 都不返回 —— 完全不支持排序
  playlists: { unit: '个', options: [] },
  albumTracks: {
    unit: '首',
    options: [
      { field: 'trackNo', label: '曲目号', defaultOrder: 'asc' },
      { field: 'title', label: '标题', defaultOrder: 'asc' },
    ],
  },
  // 实测该接口只认 createdAt（title / trackNo 都被忽略），单字段不摆按钮
  genreTracks: {
    unit: '首',
    options: [{ field: 'createdAt', label: '加入时间', defaultOrder: 'desc' }],
  },
  // 实测（2026-09-15 行为探针）：只认 title；trackNo / createdAt / duration / artistName /
  // albumName / updatedAt / year 全部被忽略。只有一个可排字段 → 不摆按钮；也不主动发 sort，
  // 免得把服务端自己的默认顺序改掉。
  playlistTracks: { unit: '首', options: [] },
}

export function listSortConfig(kind: ListKind): ListSortConfig {
  return LIST_SORT[kind]
}

/** 该列表是否值得渲染排序按钮：至少两个可选项才不是假按钮 */
export function canSort(kind: ListKind): boolean {
  // genreTracks 虽然只有一个字段，但可以切换升降序，所以也显示按钮
  if (kind === 'genreTracks') return LIST_SORT[kind].options.length >= 1
  return LIST_SORT[kind].options.length >= 2
}

/** 进页面的默认选择 = 第一项字段 + 它的默认方向；无可排字段时 undefined */
export function defaultSortSelection(kind: ListKind): SortSelection | undefined {
  const first = LIST_SORT[kind].options[0]
  return first ? { field: first.field, order: first.defaultOrder } : undefined
}

export function sortFieldLabel(kind: ListKind, field: string): string | undefined {
  return LIST_SORT[kind].options.find((option) => option.field === field)?.label
}

/**
 * 把选择翻成给服务端的 spec。
 * **字段必须在该列表的实测白名单里**，否则返回 undefined（不发明字段）。
 */
export function sortSpecFor(kind: ListKind, selection: SortSelection | undefined): SortSpec | undefined {
  if (!selection) return undefined
  const known = LIST_SORT[kind].options.some((option) => option.field === selection.field)
  return known ? { field: selection.field, order: selection.order } : undefined
}

/**
 * 快捷菜单里的一行：**一个字段一行**（升序/降序不摊成两个选项），
 * 右侧用箭头表示这一行代表的方向（↑ 升序 / ↓ 降序）。
 * 当前生效的那一行 `active` 为 true（界面用强调色 + 强调色箭头）。
 */
export interface SortMenuItem {
  field: string
  label: string
  /** 这一行代表的方向：当前生效时 = 用户选的方向，否则 = 该字段的服务端默认方向 */
  order: SortOrder
  arrow: 'up' | 'down'
  active: boolean
}

/** 方向 → 箭头：升序朝上、降序朝下（菜单右侧那颗箭头） */
export function arrowFor(order: SortOrder): 'up' | 'down' {
  return order === 'asc' ? 'up' : 'down'
}

export function sortMenuItems(kind: ListKind, selection: SortSelection | undefined): readonly SortMenuItem[] {
  return LIST_SORT[kind].options.map((option) => {
    const active = selection?.field === option.field
    const order = active && selection ? selection.order : option.defaultOrder
    return { field: option.field, label: option.label, order, arrow: arrowFor(order), active }
  })
}

/**
 * 点一行的结果：
 * · 点的就是当前字段 → **翻转升降序**（方向是一个选项，再点一下就是反向）；
 * · 点的是别的字段 → 切过去，用它自己的默认方向（首屏顺序仍与服务端默认一致）；
 * · 字段不在白名单里 → 原样返回（不发明字段）。
 */
export function applySortMenuTap(
  kind: ListKind,
  selection: SortSelection | undefined,
  field: string,
): SortSelection | undefined {
  const option = LIST_SORT[kind].options.find((candidate) => candidate.field === field)
  if (!option) return selection
  if (selection?.field === field) {
    return { field, order: selection.order === 'asc' ? 'desc' : 'asc' }
  }
  return { field, order: option.defaultOrder }
}

/** 「共 X 首 / 张 / 位 / 个」 */
export function countText(kind: ListKind, total: number): string {
  return `共 ${total} ${LIST_SORT[kind].unit}`
}
