import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Icon, iconSize } from '@/components/icon'
import { useConfirm } from '@/components/confirm-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/** 已保存服务器管理：切换、删除，以及回到登录页添加新服务器。 */
export function ServerSettingsScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const router = useRouter()
  const bottom = useBottomSpace()
  const confirm = useConfirm()
  const toast = useToast()
  const { connection, servers, switchServer, removeServer } = useServerSession()
  const [busyServerId, setBusyServerId] = useState<string | null>(null)

  const onSwitch = async (serverId: string) => {
    if (serverId === connection?.id || busyServerId) return
    setBusyServerId(serverId)
    try {
      await switchServer(serverId)
      toast('已切换服务器')
      router.back()
    } catch (error) {
      toast(error instanceof Error ? error.message : '切换服务器失败')
    } finally {
      setBusyServerId(null)
    }
  }

  const onRemove = (serverId: string, displayName: string) => {
    confirm({
      title: '删除服务器',
      message: `确定删除“${displayName}”及其保存在本机的登录信息吗？`,
      confirmText: '删除',
      destructive: true,
      onConfirm: async () => {
        try {
          await removeServer(serverId)
          toast('服务器已删除')
        } catch (error) {
          toast(error instanceof Error ? error.message : '删除服务器失败')
        }
      },
    })
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {servers.map((server, index) => {
            const active = server.id === connection?.id
            const busy = busyServerId === server.id
            return (
              <View key={server.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && !active && styles.rowPressed]}
                  onPress={() => void onSwitch(server.id)}
                  onLongPress={active ? undefined : () => onRemove(server.id, server.displayName)}
                  disabled={active || Boolean(busyServerId)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, busy }}
                  accessibilityLabel={`${active ? '当前服务器，' : '切换到'}${server.displayName}`}
                >
                  <Icon name="server" size={iconSize.lg} color={active ? colors.accent : colors.iconMid} />
                  <View style={styles.info}>
                    <Text numberOfLines={1} style={styles.name}>{server.displayName}</Text>
                    <Text numberOfLines={1} style={styles.meta}>{server.baseUrl} · {server.username}</Text>
                  </View>
                  {active ? (
                    <View style={styles.activeBadge}><Text style={styles.activeText}>当前</Text></View>
                  ) : (
                    <Pressable
                      hitSlop={10}
                      onPress={(event) => {
                        event.stopPropagation()
                        onRemove(server.id, server.displayName)
                      }}
                      disabled={Boolean(busyServerId)}
                      accessibilityRole="button"
                      accessibilityLabel={`删除服务器 ${server.displayName}`}
                    >
                      <Icon name="trash" size={iconSize.md} color={colors.textTertiary} />
                    </Pressable>
                  )}
                </Pressable>
              </View>
            )
          })}
        </View>

        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.rowPressed]}
          onPress={() => router.push('/login')}
          accessibilityRole="button"
          accessibilityLabel="添加服务器"
        >
          <Icon name="add" size={iconSize.md} color={colors.accent} />
          <Text style={styles.addText}>添加服务器</Text>
        </Pressable>
        <Text style={styles.footer}>切换服务器会停止当前播放并刷新音乐库。</Text>
      </ScrollView>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, overflow: 'hidden' },
  row: { minHeight: 68, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowPressed: { backgroundColor: colors.bgCardHover },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderDefault, marginLeft: 52 },
  info: { flex: 1, gap: spacing.xs },
  name: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textTertiary },
  activeBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.bgButtonSecondary },
  activeText: { ...typography.caption, color: colors.accent },
  addButton: { minHeight: 52, borderRadius: radius.lg, backgroundColor: colors.bgCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  addText: { ...typography.callout, color: colors.accent },
  footer: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
}))
