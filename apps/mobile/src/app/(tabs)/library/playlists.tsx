import { Stack } from 'expo-router'
import { PlaylistsScreen } from '@/screens/playlists'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '歌单' }} />
      <PlaylistsScreen />
    </>
  )
}
