import { Stack } from 'expo-router'
import { RecentTracksScreen } from '@/screens/recent-tracks'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '最近添加' }} />
      <RecentTracksScreen />
    </>
  )
}
