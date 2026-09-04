import { Stack } from 'expo-router'
import { FavoritesScreen } from '@/screens/favorites'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '我喜欢的音乐' }} />
      <FavoritesScreen />
    </>
  )
}
