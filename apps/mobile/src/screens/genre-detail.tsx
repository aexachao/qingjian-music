import { Stack, useLocalSearchParams } from 'expo-router'
import { StackBackButton } from '@/components/stack-back-button'
import { useServerSession } from '@/lib/server-session'
import { TrackListScreen } from './track-list-screen'

export function GenreDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const { provider, connection } = useServerSession()
  return (
    <>
      <Stack.Screen options={{ title: name || '流派', headerLeft: () => <StackBackButton /> }} />
      <TrackListScreen
        queryKey={['genre-tracks', connection?.id, id]}
        listKind="genreTracks"
        enabled={Boolean(provider && id)}
        fetchPage={(page, sort) => provider!.genreTracks(id, { page, size: 50, sort })}
        source={{ kind: 'genre', id: id, label: name ? `流派 · ${name}` : '流派' }}
        emptyText="这个流派下还没有歌曲"
      />
    </>
  )
}
