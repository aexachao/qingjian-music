import { Stack } from 'expo-router'
import { AllTracksScreen } from '@/screens/tracks-all'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '全部歌曲' }} />
      <AllTracksScreen />
    </>
  )
}
