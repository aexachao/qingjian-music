import { Stack } from 'expo-router'
import { ServerHistoryScreen } from '@/screens/server-history'

export default function ServerHistoryRoute() {
  return <><Stack.Screen options={{ title: '历史服务器' }} /><ServerHistoryScreen /></>
}
