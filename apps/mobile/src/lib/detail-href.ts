import { useSegments } from 'expo-router'

let lastKnownTab: 'home' | 'search' | 'library' = 'home'

/**
 * 详情页在「首页」「搜索」「音乐库」三个 Tab 下各有一份路由（同一个屏组件），
 * 这样点进详情不会把用户踢出当前 Tab。这里根据当前所在 Tab 给出正确的目标。
 *
 * 每个分支都返回完整的 { pathname, params }：expo-router 的 Href 是
 * pathname 与 params 绑定的联合类型，只把 pathname 抽成变量会过不了类型检查。
 */
export function useDetailHref() {
  const segments = useSegments()
  /**
   * 用 `at()` 而不是 `segments[i]`。
   *
   * `useSegments()` 的返回类型由 expo-router 生成的 `.expo/types/router.d.ts` 决定，
   * 而那个文件在 `.gitignore` 里（Expo 的约定，且 `.expo/` 会被工具清空）——
   * **干净检出和 CI 上都不存在**。缺它时类型退化成 1 元组 `[string]`，
   * `segments[1]` 会直接报 TS2493，于是「干净检出跑不了类型检查」。
   *
   * `at()` 对元组和数组都返回 `string | undefined`，两种情况下都成立。
   */
  const first = segments.at(0)
  const second = segments.at(1)
  if (second === 'search' || second === 'home' || second === 'library') {
    lastKnownTab = second
  }

  const activeTab = first === 'player' ? lastKnownTab : second
  const inSearch = activeTab === 'search'
  const inHome = activeTab === 'home'

  return {
    album: (id: string) => {
      if (inSearch) return { pathname: '/search/album/[id]', params: { id } } as const
      if (inHome) return { pathname: '/home/album/[id]', params: { id } } as const
      return { pathname: '/library/album/[id]', params: { id } } as const
    },
    artist: (id: string) => {
      if (inSearch) return { pathname: '/search/artist/[id]', params: { id } } as const
      if (inHome) return { pathname: '/home/artist/[id]', params: { id } } as const
      return { pathname: '/library/artist/[id]', params: { id } } as const
    },
    genre: (id: string, name = '') => {
      if (inSearch) return { pathname: '/search/genre/[id]', params: { id, name } } as const
      return { pathname: '/library/genre/[id]', params: { id, name } } as const
    },
    playlist: (id: string, name = '') => {
      if (inSearch) return { pathname: '/search/playlist/[id]', params: { id, name } } as const
      if (inHome) return { pathname: '/home/playlist/[id]', params: { id, name } } as const
      return { pathname: '/library/playlist/[id]', params: { id, name } } as const
    },
  }
}
