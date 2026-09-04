import { Stack, useLocalSearchParams } from 'expo-router'
import { useServerSession } from '@/lib/server-session'
import { TrackListScreen } from './track-list-screen'

export function PlaylistDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const { provider, connection } = useServerSession()
  return (
    <>
      <Stack.Screen options={{ title: name || '歌单' }} />
      <TrackListScreen
        queryKey={['playlist-tracks', connection?.id, id]}
        enabled={Boolean(provider && id)}
        fetchPage={(page) => provider!.playlistTracks(id, { page, size: 50 })}
        sourceLabel={name ? `歌单 · ${name}` : '歌单'}
        emptyText="这个歌单还没有歌曲"
      />
    </>
  )
}
