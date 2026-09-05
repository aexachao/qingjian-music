import { Redirect } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useServerSession } from '@/lib/server-session'
import { colors } from '@/theme/tokens'

/** 启动路由：恢复会话期间显示占位，之后按登录状态分流 */
export default function BootScreen() {
  const { status } = useServerSession()

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  return <Redirect href={status === 'signedIn' ? '/home' : '/login'} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
  },
})
