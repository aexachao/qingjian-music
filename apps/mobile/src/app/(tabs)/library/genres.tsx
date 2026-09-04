import { Stack } from 'expo-router'
import { GenresScreen } from '@/screens/genres'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '流派' }} />
      <GenresScreen />
    </>
  )
}
