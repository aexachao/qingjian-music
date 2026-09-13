import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

/** 启动路由：恢复会话期间显示占位，之后按登录状态分流 */
export default function BootScreen() {
  const styles = useStyles()
  const colors = useThemeColors()
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

const useStyles = createThemedStyles((colors) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
  },
}))
