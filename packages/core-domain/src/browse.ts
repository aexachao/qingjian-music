/**
 * 浏览节点。首页栏目、资料库入口、以及后续 CarPlay / Android Auto 的根模板
 * 共用同一份描述，车机端只需过滤 `carPlay: true` 的节点即可，不用另写一套导航。
 */
export type BrowseNodeKind =
  | 'recentlyAdded'
  | 'recentlyPlayed'
  | 'favorites'
  | 'radio'
  | 'albums'
  | 'artists'
  | 'tracks'
  | 'genres'
  | 'playlists'

export interface BrowseNode {
  kind: BrowseNodeKind
  /** i18n key，中文文案在 locales 里 */
  titleKey: string
  /** SF Symbols / Material 图标名 */
  icon: string
  /** 是否出现在车机根列表 */
  carPlay: boolean
  /** 需要的后端能力，缺失则不渲染 */
  requires?: 'favorites' | 'playHistory' | 'radio' | 'genres' | 'playlists'
}

export const DEFAULT_BROWSE_NODES: readonly BrowseNode[] = [
  { kind: 'recentlyAdded', titleKey: 'browse.recentlyAdded', icon: 'clock.badge.checkmark', carPlay: true },
  { kind: 'recentlyPlayed', titleKey: 'browse.recentlyPlayed', icon: 'clock.arrow.circlepath', carPlay: true, requires: 'playHistory' },
  { kind: 'favorites', titleKey: 'browse.favorites', icon: 'heart', carPlay: true, requires: 'favorites' },
  { kind: 'radio', titleKey: 'browse.radio', icon: 'dot.radiowaves.left.and.right', carPlay: true, requires: 'radio' },
  { kind: 'albums', titleKey: 'browse.albums', icon: 'square.stack', carPlay: true },
  { kind: 'artists', titleKey: 'browse.artists', icon: 'music.mic', carPlay: true },
  { kind: 'tracks', titleKey: 'browse.tracks', icon: 'music.note', carPlay: false },
  { kind: 'genres', titleKey: 'browse.genres', icon: 'guitars', carPlay: false, requires: 'genres' },
  { kind: 'playlists', titleKey: 'browse.playlists', icon: 'music.note.list', carPlay: true, requires: 'playlists' },
]
