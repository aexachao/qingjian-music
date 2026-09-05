import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Icon, iconSize } from '@/components/icon'
import { useBottomSpace } from '@/lib/bottom-space'
import { useServerSession } from '@/lib/server-session'
import { clearArtworkCache } from '@/player/artwork'
import { colors, radius, spacing, typography } from '@/theme/tokens'

export function SettingsScreen() {
  const router = useRouter()
  const { provider, connection, servers, signOut, switchServer } = useServerSession()
  const bottom = useBottomSpace()
  const [busy, setBusy] = useState(false)

  const me = useQuery({
    queryKey: ['me', connection?.id],
    enabled: Boolean(provider),
    queryFn: () => provider!.currentUser(),
    staleTime: 10 * 60_000,
  })

  async function onSwitch(serverId: string) {
    if (serverId === connection?.id || busy) return
    setBusy(true)
    try {
      await switchServer(serverId)
    } catch (error) {
      Alert.alert('切换失败', error instanceof Error ? error.message : '请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Text style={styles.sectionTitle}>当前服务器</Text>
      <View style={styles.card}>
        <Row label="名称" value={connection?.displayName ?? '未连接'} />
        <Row label="地址" value={connection?.baseUrl ?? '-'} />
        <Row label="账号" value={me.data?.name ?? connection?.username ?? '-'} />
        <Row label="后端" value={connection?.providerId === 'fnos' ? '飞牛音乐' : (connection?.providerId ?? '-')} />
      </View>

      <Text style={styles.sectionTitle}>已保存的服务器</Text>
      <View style={styles.card}>
        {servers.map((server, index) => (
          <Pressable
            key={server.id}
            style={[styles.row, index > 0 && styles.rowBorder]}
            onPress={() => void onSwitch(server.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: server.id === connection?.id }}
            accessibilityLabel={`切换到 ${server.displayName}`}
          >
            <View style={styles.rowText}>
              <Text style={styles.label}>{server.displayName}</Text>
              <Text style={styles.value}>
                {server.username} · {server.baseUrl}
              </Text>
            </View>
            {server.id === connection?.id ? (
              <Icon name="check" size={iconSize.md} color={colors.accent} />
            ) : (
              <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
            )}
          </Pressable>
        ))}
        <Pressable
          style={[styles.row, servers.length > 0 && styles.rowBorder]}
          onPress={() => router.push('/login')}
          accessibilityRole="button"
          accessibilityLabel="添加服务器"
        >
          <View style={styles.actionRow}>
            <Icon name="add" size={iconSize.sm} color={colors.accent} />
            <Text style={styles.action}>添加服务器</Text>
          </View>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>存储</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={() => {
            clearArtworkCache()
            Alert.alert('已清理', '封面缓存已删除，下次播放会重新下载')
          }}
          accessibilityRole="button"
          accessibilityLabel="清理封面缓存"
        >
          <View style={styles.actionRow}>
            <Icon name="trash" size={iconSize.sm} color={colors.accent} />
            <Text style={styles.action}>清理封面缓存</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={() =>
            Alert.alert('退出登录', '会保留服务器地址，下次可以直接重新登录。', [
              { text: '取消', style: 'cancel' },
              {
                text: '退出',
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    await signOut()
                    router.replace('/login')
                  })()
                },
              },
            ])
          }
          accessibilityRole="button"
          accessibilityLabel="退出登录"
        >
          <View style={styles.actionRow}>
            <Icon name="signOut" size={iconSize.sm} color={colors.danger} />
            <Text style={styles.destructive}>退出登录</Text>
          </View>
        </Pressable>
      </View>

      <Text style={styles.footer}>轻简音乐 · 为飞牛音乐打造的移动客户端</Text>
    </ScrollView>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text numberOfLines={1} style={styles.value}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.md, marginLeft: spacing.xs },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  rowText: { flex: 1, gap: 2 },
  label: { ...typography.callout, color: colors.textPrimary },
  value: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  /** 「图标 + 文字」的操作行：破坏性操作也必须留着中文标签 */
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { ...typography.callout, color: colors.accent },
  destructive: { ...typography.callout, color: colors.danger },
  footer: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xl },
})
