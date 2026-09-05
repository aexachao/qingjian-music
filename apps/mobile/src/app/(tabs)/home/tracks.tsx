import { Stack } from 'expo-router'
import { AllTracksScreen } from '@/screens/tracks-all'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '歌曲' }} />
      <AllTracksScreen />
    </>
  )
}
