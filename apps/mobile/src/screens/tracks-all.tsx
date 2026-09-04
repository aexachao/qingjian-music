import { useServerSession } from '@/lib/server-session'
import { TrackListScreen } from './track-list-screen'

export function AllTracksScreen() {
  const { provider, connection } = useServerSession()
  return (
    <TrackListScreen
      queryKey={['tracks', connection?.id]}
      fetchPage={(page) => provider!.tracks({ page, size: 50, sort: { field: 'createdAt', order: 'desc' } })}
      sourceLabel="全部歌曲"
      emptyText="曲库里还没有歌曲"
    />
  )
}
