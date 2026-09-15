import { useServerSession } from '@/lib/server-session'
import { TrackListScreen } from './track-list-screen'

export function AllTracksScreen() {
  const { provider, connection } = useServerSession()
  return (
    <TrackListScreen
      queryKey={['tracks', connection?.id]}
      listKind="allTracks"
      fetchPage={(page, sort) => provider!.tracks({ page, size: 50, sort })}
      source={{ kind: 'tracks', label: '全部歌曲' }}
      emptyText="曲库里还没有歌曲"
    />
  )
}
