import { Stack } from 'expo-router'
import { DownloadedScreen } from '@/screens/downloaded'

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: '已下载' }} />
      <DownloadedScreen />
    </>
  )
}
