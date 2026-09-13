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
  if (segments[1] === 'search' || segments[1] === 'home' || segments[1] === 'library') {
    lastKnownTab = segments[1]
  }

  const activeTab = segments[0] === 'player' ? lastKnownTab : segments[1]
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
