import { Stack } from 'expo-router'
import { colors } from '@/theme/tokens'

export default function StackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        headerBackTitle: '返回',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: '搜索' }} />
    </Stack>
  )
}
