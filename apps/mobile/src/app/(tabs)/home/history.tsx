import { Stack } from 'expo-router'
import { HistoryScreen } from '@/screens/history'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '最近播放' }} />
      <HistoryScreen />
    </>
  )
}
