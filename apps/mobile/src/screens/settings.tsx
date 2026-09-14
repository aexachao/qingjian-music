import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import { useQuery } from '@tanstack/react-query'
import { CollapsibleHeaderBar, LargeTitleHeader } from '@/components/collapsible-tab-header'
import { useConfirm } from '@/components/confirm-modal'
import { Icon, iconSize, type IconName } from '@/components/icon'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { QUALITY_LABELS, useAudioQualityPreferences } from '@/lib/audio-quality-preferences'
import { THEME_MODE_OPTIONS, useAppearancePreferences } from '@/lib/appearance-preferences'
import { useServerSession } from '@/lib/server-session'
import { audioCacheStats } from '@/player/audio-cache'
import { formatBytes } from '@/player/audio-cache-policy'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

const FEEDBACK_EMAIL = 'arieachao@163.com'

/** 版本号从 app.json 读，不硬编码 —— 写死会在发新版后静默显示错版本 */
const APP_VERSION = Constants.expoConfig?.version ?? '—'

/**
 * 设置页：对齐 Apple Music 风格的一级页签。
 * 1. 顶部用户卡：圆形字母头像 + 账号名 +「管理员/普通用户」胶囊徽章 + 归属系统（fnOS）
 * 2. 偏好设置卡片（3项）：外观主题、音质（Wi-Fi/蜂窝/下载）、缓存（自动缓存/容量上限/歌曲首数/清理）
 * 3. 帮助与关于卡片（2项）：问题反馈、关于
 * 4. 账号退出卡片（1项）：退出登录
 */
export function SettingsScreen() {
  const styles = useStyles()
  const router = useRouter()
  const { provider, connection, signOut } = useServerSession()
  const bottom = useBottomSpace()
  const themeMode = useAppearancePreferences((s) => s.themeMode)
  const currentThemeLabel = THEME_MODE_OPTIONS.find((t) => t.value === themeMode)?.label ?? '跟随系统'
  const wifiQuality = useAudioQualityPreferences((s) => s.wifiQuality)
  const audioCache = audioCacheStats()

  const me = useQuery({
    queryKey: ['me', connection?.id],
    enabled: Boolean(provider),
    queryFn: () => provider!.currentUser(),
    staleTime: 10 * 60_000,
  })

  const userName = me.data?.name ?? connection?.username ?? '未登录'
  const backendName = connection?.providerId === 'fnos' ? 'fnOS' : (connection?.providerId ?? '未知后端')
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  const confirm = useConfirm()
  const toast = useToast()

  // 1. 问题反馈
  const onFeedback = async () => {
    const subject = encodeURIComponent('轻简音乐客户端 - 问题与建议')
    const body = encodeURIComponent(
      `\n\n--------------------------\n设备系统: ${Platform.OS} ${Platform.Version}\n客户端版本: ${APP_VERSION}\n`,
    )
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`

    try {
      await Linking.openURL(url)
    } catch {
      confirm({
        title: '联系反馈',
        message: `无法直接调起系统邮件客户端。\n您可以发送邮件至：\n${FEEDBACK_EMAIL}`,
        confirmText: '复制邮箱',
        cancelText: '取消',
        onConfirm: async () => {
          await Clipboard.setStringAsync(FEEDBACK_EMAIL)
          toast('反馈邮箱地址已复制到剪贴板')
        },
      })
    }
  }

  // 2. 关于
  const onAbout = () => {
    router.push('/(tabs)/settings/about')
  }

  // 3. 支持作者
  const onSupport = () => {
    router.push('/(tabs)/settings/support')
  }

  // 3. 退出登录
  const onSignOut = () => {
    confirm({
      title: '退出登录',
      message: '确定要退出当前账号并返回登录页吗？',
      confirmText: '退出登录',
      destructive: true,
      onConfirm: async () => {
        await signOut()
        router.replace('/login')
      },
    })
  }

  return (
    <View style={styles.screen}>
      <CollapsibleHeaderBar title="设置" scrollY={scrollY} />
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        <LargeTitleHeader title="设置" scrollY={scrollY} />

        {/* 顶部用户卡片 */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{userName.slice(0, 1).toLowerCase()}</Text>
          </View>
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <Text numberOfLines={1} style={styles.userName}>
                {userName}
              </Text>
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>
                  {me.data?.isAdmin ? '管理员' : '普通用户'}
                </Text>
              </View>
            </View>
            <Text numberOfLines={1} style={styles.userMeta}>
              {backendName}
            </Text>
          </View>
        </View>

        {/* 卡片 1：服务器与偏好设置 */}
        <View style={styles.card}>
          <SettingsRow
            icon="server"
            label="服务器"
            value={connection?.displayName}
            onPress={() => router.push('/(tabs)/settings/servers' as never)}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="appearance"
            label="外观主题"
            value={currentThemeLabel}
            onPress={() => router.push('/(tabs)/settings/appearance')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="quality"
            label="音质"
            /* 后端只有一档输出时如实说明，别摆一个「看起来能选」的当前值 */
            value={provider?.capabilities.qualityTiers === false ? '仅原始音质' : QUALITY_LABELS[wifiQuality]}
            onPress={() => router.push('/(tabs)/settings/audio-quality')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="cache"
            label="缓存"
            value={formatBytes(audioCache.bytes)}
            onPress={() => router.push('/(tabs)/settings/cache')}
          />
        </View>

        {/* 卡片 2：帮助与关于 */}
        <View style={styles.card}>
          <SettingsRow
            icon="feedback"
            label="问题反馈"
            onPress={onFeedback}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="heart"
            label="支持作者"
            onPress={onSupport}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="about"
            label="关于"
            value={`v${APP_VERSION}`}
            onPress={onAbout}
          />
        </View>

        {/* 卡片 3：账号退出 */}
        <View style={styles.card}>
          <SettingsRow
            icon="signOut"
            label="退出登录"
            onPress={onSignOut}
          />
        </View>

        <Text style={styles.footer}>轻简音乐 · 为飞牛音乐打造的移动客户端</Text>
      </Animated.ScrollView>
    </View>
  )
}

interface SettingsRowProps {
  icon: IconName
  label: string
  value?: string
  onPress?: () => void
  accessibilityLabel?: string
}

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  accessibilityLabel,
}: SettingsRowProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Icon name={icon} size={22} color={colors.accent} />
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
    </Pressable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    gap: spacing.lg,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#3b5998',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textOnAccent,
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  adminBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.badgeText,
  },
  userMeta: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginLeft: 52,
  },
  label: {
    ...typography.callout,
    fontSize: 16,
    color: colors.textPrimary,
    flex: 1,
  },
  value: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textTertiary,
    marginRight: 4,
  },
  footer: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
}))
