/**
 * 快捷菜单的**唯一条目定义**（一期 B1）。
 *
 * 背景：这套菜单原本有三份互相独立的实现 —— `TrackMoreButton`（列表行）、
 * `DeckMoreButton`（播放页 / 队列顶部卡）、以及队列待播行里内联的那份。
 * 三份各写各的条目与顺序，于是出现了真实事故：**播放页的「添加到歌单」一直是个假功能**
 * （只 `toast('已添加到歌单')`，不发任何请求），而列表那份早就接了真实现 ——
 * A3 只改了一处，没人发现另一处。
 *
 * 所以这里把「哪个上下文有哪些条目、顺序如何、图标文案是什么」全部收进一个纯模块：
 * - 不 import RN / expo / 原生菜单，可以直接跑单测；
 * - 三处 UI 只负责「把 id 渲染成原生菜单项」和「把点击派发到对应动作」；
 * - 新增条目只改这一个文件，不可能再出现三份漂移。
 *
 * 上下文：
 * - `list`     列表里的曲目（可能还没进队列）
 * - `upcoming` 队列里「继续播放」的待播行
 * - `current`  当前正在播放的曲目（播放页、队列顶部卡）
 *
 * 队列页「历史」里的行也用 `list`：它们是普通曲目，能做的操作与列表行一致。
 * 差别只在**能力**上 —— 历史行手里的 `QueueItem` 不一定带着完整曲目，
 * 那种情况下靠 `capabilities.hasTrack` 把「下一首播放 / 加入队列」收起来（不摆假条目）。
 */

export type TrackMenuContext = 'list' | 'upcoming' | 'current'

export const TRACK_MENU_IDS = [
  'play-next',
  'add-to-queue',
  'add-to-playlist',
  'move-to-end',
  'toggle-favorite',
  'remove-from-queue',
  'remove-from-history',
  'share-song',
  'share-lyrics',
  'song-info',
  'goto-album',
  'goto-artist',
  'lyric-offset',
] as const

export type TrackMenuId = (typeof TRACK_MENU_IDS)[number]

export const TRACK_MENU_LABEL: Record<TrackMenuId, string> = {
  'play-next': '下一首播放',
  'add-to-queue': '加入队列',
  'add-to-playlist': '添加到歌单',
  'move-to-end': '移到队尾',
  'toggle-favorite': '喜欢',
  'remove-from-queue': '从队列移除',
  'remove-from-history': '从历史记录移除',
  'share-song': '分享歌曲',
  'share-lyrics': '分享歌词',
  'song-info': '歌曲信息',
  'goto-album': '前往专辑',
  'goto-artist': '查看艺术家',
  'lyric-offset': '歌词偏移',
}

/** 平台图标：iOS 用 SF Symbol 名，Android 用系统 drawable 名 */
export const TRACK_MENU_ICON: Record<TrackMenuId, { ios: string; android: string }> = {
  'play-next': { ios: 'text.insert', android: 'ic_media_next' },
  'add-to-queue': { ios: 'text.append', android: 'ic_menu_add' },
  'add-to-playlist': { ios: 'plus.circle', android: 'ic_menu_add' },
  'move-to-end': { ios: 'text.append', android: 'ic_menu_sort_by_size' },
  'toggle-favorite': { ios: 'heart', android: 'ic_menu_myplaces' },
  'remove-from-queue': { ios: 'trash', android: 'ic_menu_delete' },
  'remove-from-history': { ios: 'trash', android: 'ic_menu_delete' },
  'share-song': { ios: 'square.and.arrow.up', android: 'ic_menu_share' },
  'share-lyrics': { ios: 'quote.bubble', android: 'ic_menu_info_details' },
  'song-info': { ios: 'info.circle', android: 'ic_menu_help' },
  'goto-album': { ios: 'music.note.list', android: 'ic_media_play' },
  'goto-artist': { ios: 'person.crop.circle', android: 'ic_menu_myplaces' },
  'lyric-offset': { ios: 'clock', android: 'ic_menu_recent_history' },
}

/** iOS 上要标成破坏性（红字）的条目 */
export const TRACK_MENU_DESTRUCTIVE: ReadonlySet<TrackMenuId> = new Set<TrackMenuId>(['remove-from-queue', 'remove-from-history'])

/**
 * 在 iOS 上要渲染成「分组（带子项）」而不是单个条目的 id。
 * 歌词偏移是个组：±0.5 秒 / 重置，原生菜单里做不了连续滑块。
 */
export const TRACK_MENU_GROUP_IDS: ReadonlySet<TrackMenuId> = new Set<TrackMenuId>(['lyric-offset'])

export interface TrackMenuCapabilities {
  /** 后端支持收藏 */
  canFavorite: boolean
  /** 收藏状态已知（后端不返回 isFavorite 时为 false） */
  isFavoriteKnown: boolean
  /** 后端支持歌单写入 */
  canWritePlaylist: boolean
  /** 曲目带专辑信息 */
  hasAlbum: boolean
  /** 曲目带艺术家信息 */
  hasArtist: boolean
  /** 有同步歌词（歌词偏移才有意义） */
  canAdjustLyricOffset: boolean
  /**
   * 手上有**完整曲目**（`Track`，不只是 trackId）。
   * 列表行从 `Track` 来，恒为 true；队列页的历史行看 `QueueItem.track` 有没有留下来。
   */
  hasTrack: boolean
}

export interface TrackMenuInput {
  context: TrackMenuContext
  capabilities: TrackMenuCapabilities
  /** 待播上下文：该行在待播列表里的位置，1 = 紧跟在当前曲目之后 */
  position?: number
  /** 待播上下文：待播行总数（不含当前曲目） */
  upcomingCount?: number
  /** 历史行标识：用于决定是显示「从队列移除」还是「从历史记录移除」 */
  isHistory?: boolean
}

/** 该上下文下可见的条目（Android 平铺顺序 / iOS 分组前的原始顺序） */
export function trackMenuIds(input: TrackMenuInput): TrackMenuId[] {
  const { capabilities } = input

  if (input.context === 'upcoming') {
    const position = input.position ?? 1
    const upcomingCount = input.upcomingCount ?? 0
    const ids: TrackMenuId[] = []
    // 队列内操作组
    if (position > 1) ids.push('play-next')
    if (position < upcomingCount) ids.push('move-to-end')
    // 完整菜单：添加到歌单、分享、信息、跳转
    if (capabilities.canWritePlaylist) ids.push('add-to-playlist')
    ids.push('share-song', 'song-info')
    if (capabilities.hasAlbum) ids.push('goto-album')
    if (capabilities.hasArtist) ids.push('goto-artist')
    // 收藏和删除排在最后（用户要求）
    if (capabilities.canFavorite && capabilities.isFavoriteKnown) ids.push('toggle-favorite')
    ids.push('remove-from-queue')
    return ids
  }

  if (input.context === 'current') {
    const ids: TrackMenuId[] = []
    if (capabilities.canWritePlaylist) ids.push('add-to-playlist')
    ids.push('share-song', 'share-lyrics', 'song-info')
    if (capabilities.hasAlbum) ids.push('goto-album')
    if (capabilities.hasArtist) ids.push('goto-artist')
    if (capabilities.canAdjustLyricOffset) ids.push('lyric-offset')
    return ids
  }

  const ids: TrackMenuId[] = []
  // 队列类操作要完整曲目（playNext / appendTracks 的入参是 Track[]）。
  // 只有 trackId 时**不摆**这两条 —— 摆了就是点了没反应的假条目。
  if (capabilities.hasTrack) ids.push('play-next', 'add-to-queue')
  if (capabilities.canWritePlaylist) ids.push('add-to-playlist')
  ids.push('share-song', 'song-info')
  if (capabilities.hasAlbum) ids.push('goto-album')
  if (capabilities.hasArtist) ids.push('goto-artist')
  // 收藏从列表行右侧的图标挪进菜单（第 4 轮），并按你的要求排**最后**一条。
  // 状态未知时不显示 —— 否则会出现「点了一下，状态却没变」的观感（与待播行同一条策略）。
  if (capabilities.canFavorite && capabilities.isFavoriteKnown) ids.push('toggle-favorite')
  // 历史行：添加「从历史记录移除」（与左滑删除功能对应）
  if (input.isHistory) ids.push('remove-from-history')
  return ids
}

export interface TrackMenuGroup {
  id: string
  ids: TrackMenuId[]
}

/** 「当前」上下文在 iOS 上向下弹出时的分组模板（向上弹出是它的整体反向） */
const CURRENT_GROUPS: TrackMenuGroup[] = [
  { id: 'group-playlist', ids: ['add-to-playlist'] },
  { id: 'group-share', ids: ['share-song', 'share-lyrics'] },
  { id: 'group-details', ids: ['song-info', 'goto-album', 'goto-artist'] },
]

const LIST_GROUPS: TrackMenuGroup[] = [
  { id: 'group-queue', ids: ['play-next', 'add-to-queue', 'add-to-playlist'] },
  { id: 'group-share', ids: ['share-song'] },
  { id: 'group-details', ids: ['song-info', 'goto-album', 'goto-artist'] },
  // 收藏排最后一条（你的要求）
  { id: 'group-favorite', ids: ['toggle-favorite'] },
  // 历史行的删除操作单独一组，排在最末（破坏性操作）
  { id: 'group-remove', ids: ['remove-from-history'] },
]

/** 待播行分组：队列内操作 + 完整菜单 + 收藏和删除（破坏性操作排最后） */
const UPCOMING_GROUPS: TrackMenuGroup[] = [
  { id: 'group-queue-ops', ids: ['play-next', 'move-to-end'] },
  { id: 'group-actions', ids: ['add-to-playlist', 'share-song'] },
  { id: 'group-details', ids: ['song-info', 'goto-album', 'goto-artist'] },
  { id: 'group-favorite', ids: ['toggle-favorite'] },
  { id: 'group-remove', ids: ['remove-from-queue'] },
]

/** 歌词偏移组永远排在最后，不参与「向上弹出」的整体反向 */
const TAIL_GROUP_IDS: TrackMenuId[] = ['lyric-offset']

/**
 * iOS 的分组顺序。
 *
 * UIKit 从锚点由近及远排列，所以**向上弹出**与**向下弹出**需要的组顺序正好相反；
 * 与其手写两份容易漏改的数组，这里只维护「向下」一份，向上时整体反向（组顺序 + 组内顺序）。
 * 唯一例外是歌词偏移组：它在两种方向下都排在最后，所以单独抽出来在末尾追加。
 */
export function trackMenuGroups(
  ids: TrackMenuId[],
  context: TrackMenuContext,
  popDirection: 'up' | 'down' = 'up',
): TrackMenuGroup[] {
  const present = new Set(ids)
  const tail = TAIL_GROUP_IDS.filter((id) => present.has(id))
  // 待播行和其它 context 都用分组（用户要求一致的菜单风格）
  const template = context === 'current' ? CURRENT_GROUPS : context === 'upcoming' ? UPCOMING_GROUPS : LIST_GROUPS

  let groups = template
    .map((group) => ({ id: group.id, ids: group.ids.filter((id) => present.has(id)) }))
    .filter((group) => group.ids.length > 0)

  if (context === 'current' && popDirection === 'up') {
    groups = groups.reverse().map((group) => ({ id: group.id, ids: [...group.ids].reverse() }))
  }

  if (tail.length > 0) groups = [...groups, { id: 'group-lyric-offset', ids: tail }]
  return groups
}

/** 条目文案：只有收藏会随状态变化 */
export function trackMenuLabel(id: TrackMenuId, state: { isFavorite?: boolean } = {}): string {
  if (id === 'toggle-favorite') return state.isFavorite ? '取消喜欢' : '喜欢'
  return TRACK_MENU_LABEL[id]
}

/** 条目图标：只有收藏会随状态变化 */
export function trackMenuIcon(id: TrackMenuId, state: { isFavorite?: boolean } = {}): { ios: string; android: string } {
  if (id === 'toggle-favorite' && state.isFavorite) {
    return { ios: 'heart.slash', android: TRACK_MENU_ICON['toggle-favorite'].android }
  }
  return TRACK_MENU_ICON[id]
}

/**
 * 「下一首播放」的目标下标。
 * 当前曲目恒在 store index 0，所以插到它之后就是 1。
 */
export function nextPlayTargetIndex(): number {
  return 1
}

/**
 * 「移到队尾」的目标下标。
 * 队列总长 = 待播行数 + 当前曲目，所以最后一个下标恰好等于待播行数。
 * 这个 off-by-one 很容易写错，所以抽成函数并单测。
 */
export function queueEndTargetIndex(upcomingCount: number): number {
  return upcomingCount
}
