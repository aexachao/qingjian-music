import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Icon, iconSize, type IconName } from '@/components/icon'
import { useBottomSpace } from '@/lib/bottom-space'
import { useServerSession } from '@/lib/server-session'
import { clearArtworkCache } from '@/player/artwork'
import { audioCacheStats, clearAudioCache } from '@/player/audio-cache'
import { formatBytes } from '@/player/audio-cache-policy'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/**
 * 设置页：顶部用户卡 + 分组卡片行，和飞牛音乐 web 端的设置页一个结构。
 * 每行都是「图标 + 标题 +（右侧值 / 箭头）」，信息行不给箭头，可点的行才给。
 */
export function SettingsScreen() {
  const router = useRouter()
  const { provider, connection, servers, signOut, switchServer } = useServerSession()
  const bottom = useBottomSpace()
  const [busy, setBusy] = useState(false)
  // 缓存占用是磁盘读数，进页面算一次、清理后再算一次就够了
  const [audioCache, setAudioCache] = useState(() => audioCacheStats())

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

  const userName = me.data?.name ?? connection?.username ?? '未登录'
  const backendName = connection?.providerId === 'fnos' ? '飞牛音乐' : (connection?.providerId ?? '未知后端')

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      {/* 用户卡：头像取名字首字，飞牛的管理员会标出来 */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{userName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.userText}>
          <Text numberOfLines={1} style={styles.userName}>
            {userName}
          </Text>
          <Text numberOfLines={1} style={styles.userMeta}>
            {me.data?.isAdmin ? '管理员' : '普通用户'} · {backendName}
          </Text>
        </View>
      </View>

      <SectionTitle text="服务器" />
      <View style={styles.card}>
        <SettingsRow icon="server" label="当前服务器" value={connection?.displayName ?? '未连接'} />
        <SettingsRow icon="storage" label="地址" value={connection?.baseUrl ?? '-'} divider />
      </View>

      <SectionTitle text="已保存的服务器" />
      <View style={styles.card}>
        {servers.map((server, index) => (
          <SettingsRow
            key={server.id}
            icon="server"
            label={server.displayName}
            value={`${server.username} · ${server.baseUrl}`}
            divider={index > 0}
            selected={server.id === connection?.id}
            onPress={() => void onSwitch(server.id)}
            accessibilityLabel={`切换到 ${server.displayName}`}
          />
        ))}
        <SettingsRow
          icon="add"
          label="添加服务器"
          tone="accent"
          divider={servers.length > 0}
          onPress={() => router.push('/login')}
        />
      </View>

      <SectionTitle text="存储" />
      <View style={styles.card}>
        <SettingsRow
          icon="quality"
          label="播放缓存"
          value={`${formatBytes(audioCache.bytes)} / ${formatBytes(audioCache.budgetBytes)} · ${audioCache.files} 首`}
        />
        <SettingsRow
          icon="trash"
          label="清理播放缓存"
          tone="accent"
          divider
          onPress={() => {
            clearAudioCache()
            setAudioCache(audioCacheStats())
            Alert.alert('已清理', '本地音频缓存已删除，之后播放会重新从服务器读取')
          }}
        />
        <SettingsRow
          icon="trash"
          label="清理封面缓存"
          tone="accent"
          divider
          onPress={() => {
            clearArtworkCache()
            Alert.alert('已清理', '封面缓存已删除，下次播放会重新下载')
          }}
        />
      </View>

      <View style={[styles.card, styles.lastCard]}>
        <SettingsRow
          icon="signOut"
          label="退出登录"
          tone="danger"
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
        />
      </View>

      <Text style={styles.footer}>轻简音乐 · 为飞牛音乐打造的移动客户端</Text>
    </ScrollView>
  )
}

function SectionTitle({ text }: { text: string }) {
  return <Text style={styles.sectionTitle}>{text}</Text>
}

interface SettingsRowProps {
  icon: IconName
  label: string
  /** 右侧的值，信息行用 */
  value?: string
  /** 文字色调：默认白，accent 是可执行动作，danger 是破坏性动作 */
  tone?: 'default' | 'accent' | 'danger'
  /** 除第一行外都画上分隔线 */
  divider?: boolean
  /** 当前选中项（服务器列表用），显示对勾 */
  selected?: boolean
  onPress?: () => void
  accessibilityLabel?: string
}

function SettingsRow({
  icon,
  label,
  value,
  tone = 'default',
  divider = false,
  selected = false,
  onPress,
  accessibilityLabel,
}: SettingsRowProps) {
  const labelStyle = tone === 'accent' ? styles.labelAccent : tone === 'danger' ? styles.labelDanger : styles.label
  const iconColor = tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.iconMid

  const body = (
    <>
      <Icon name={icon} size={iconSize.md} color={iconColor} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={labelStyle}>
          {label}
        </Text>
        {value ? (
          <Text numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={iconSize.md} color={colors.accent} /> : null}
      {onPress && !selected ? <Icon name="chevronRight" size={iconSize.md} color={colors.textQuaternary} /> : null}
    </>
  )

  if (!onPress) {
    return <View style={[styles.row, divider && styles.rowBorder]}>{body}</View>
  }

  return (
    <Pressable
      style={[styles.row, divider && styles.rowBorder]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
    >
      {body}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // 页面自己带底色：Tabs 的场景背景之外再兜一层，任何时候都不会露白
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, gap: spacing.sm },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.bgAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.title, color: colors.textPrimary },
  userText: { flex: 1, gap: 2 },
  userName: { ...typography.headline, color: colors.textPrimary },
  userMeta: { ...typography.caption, color: colors.textTertiary },
  sectionTitle: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.md, marginLeft: spacing.xs },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, overflow: 'hidden' },
  lastCard: { marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    // 行高固定 ≥52，图标行和纯信息行看起来是一套
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  rowText: { flex: 1, gap: 2 },
  label: { ...typography.callout, color: colors.textPrimary },
  labelAccent: { ...typography.callout, color: colors.accent },
  labelDanger: { ...typography.callout, color: colors.danger },
  value: { ...typography.caption, color: colors.textSecondary },
  footer: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xl },
})
