import { useServerSession } from '@/lib/server-session'
import { EmptyState } from '@/components/list-states'
import { TrackListScreen } from './track-list-screen'

export function FavoritesScreen() {
  const { provider, connection } = useServerSession()
  if (provider && !provider.capabilities.favorites) return <EmptyState text="当前服务器不支持收藏" />
  return (
    <TrackListScreen
      queryKey={['favorites', connection?.id]}
      enabled={Boolean(provider?.favorites)}
      fetchPage={(page) => provider!.favorites!({ page, size: 50 })}
      sourceLabel="我喜欢的音乐"
      emptyText="还没有收藏的歌曲"
    />
  )
}
