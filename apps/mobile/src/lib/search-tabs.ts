/**
 * 搜索结果页签（纯逻辑，不 import react-native / expo，可直接单测）。
 *
 * ── 为什么页签不按命中数裁剪 ──────────────────────────────────────────────
 * 最初的设想是「0 命中的类目不出页签」，后来改成**全部显示、0 命中切过去给空态**
 * （2026-09-15 拍板）。两个原因：
 *   ① 页签栏会「逐个蹦出来」—— 可见性依赖各类 `total` 都返回，慢的请求会让栏跳变；
 *   ② 页签全显示时，用户能明确知道「这个类目里就是没有」，而不是「这个类目不存在」。
 * 代价是「歌单」这类后端能力可能根本不支持的类目：那是**能力**问题不是命中数问题，
 * 所以仍然按能力过滤（`canSearchPlaylists`）。
 */

export type SearchTabKey = 'tracks' | 'albums' | 'artists' | 'playlists'

export interface SearchTab {
  key: SearchTabKey
  label: string
}

/** 顺序即展示顺序：歌曲在最前（搜索结果里最常看的就是它） */
const ALL_TABS: readonly SearchTab[] = [
  { key: 'tracks', label: '歌曲' },
  { key: 'albums', label: '专辑' },
  { key: 'artists', label: '艺术家' },
  { key: 'playlists', label: '歌单' },
]

/**
 * 当前后端下应该出现哪些页签。
 * 只按**能力**过滤（后端没有 `searchPlaylists` 就永远不可能有结果，摆上去是假页签）；
 * **不**按命中数过滤。
 */
export function searchTabs(options: { canSearchPlaylists: boolean }): readonly SearchTab[] {
  return options.canSearchPlaylists ? ALL_TABS : ALL_TABS.filter((tab) => tab.key !== 'playlists')
}

/** 页签栏该显示什么文案（也用于空态文案，避免两处各写一套） */
export function searchTabLabel(tabs: readonly SearchTab[], key: SearchTabKey): string {
  return tabs.find((tab) => tab.key === key)?.label ?? ''
}

/**
 * 当前页签的兜底：不在集合里（能力变了、或进来时给了个已下线的类目）就落到第一个。
 * 页签集合永远是非空的 —— 歌曲页签不受任何能力影响。
 */
export function clampSearchTabKey(
  tabs: readonly SearchTab[],
  current: SearchTabKey | undefined,
): SearchTabKey {
  if (current && tabs.some((tab) => tab.key === current)) return current
  return tabs[0]?.key ?? 'tracks'
}
