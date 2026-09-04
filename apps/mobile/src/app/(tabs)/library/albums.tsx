import { Stack } from 'expo-router'
import { AlbumsScreen } from '@/screens/albums'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '专辑' }} />
      <AlbumsScreen />
    </>
  )
}
