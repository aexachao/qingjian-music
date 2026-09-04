import { useSegments } from 'expo-router'

/**
 * 详情页在「资料库」和「搜索」两个 Tab 下各有一份路由（同一个组件），
 * 这样点进详情不会把用户踢出当前 Tab。这里根据当前所在 Tab 给出正确的目标。
 */
export function useDetailHref() {
  const segments = useSegments()
  const inSearch = segments[1] === 'search'

  return {
    album: (id: string) =>
      inSearch
        ? ({ pathname: '/search/album/[id]', params: { id } } as const)
        : ({ pathname: '/library/album/[id]', params: { id } } as const),
    artist: (id: string) =>
      inSearch
        ? ({ pathname: '/search/artist/[id]', params: { id } } as const)
        : ({ pathname: '/library/artist/[id]', params: { id } } as const),
    genre: (id: string, name = '') => ({ pathname: '/library/genre/[id]', params: { id, name } } as const),
    playlist: (id: string, name = '') => ({ pathname: '/library/playlist/[id]', params: { id, name } } as const),
  }
}
