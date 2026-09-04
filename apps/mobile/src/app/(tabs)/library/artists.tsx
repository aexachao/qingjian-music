import { Stack } from 'expo-router'
import { ArtistsScreen } from '@/screens/artists'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '艺术家' }} />
      <ArtistsScreen />
    </>
  )
}
