import { useCallback, useState, useSyncExternalStore } from 'react'
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
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
import { THEME_MODE_OPTIONS, useAppearancePreferences } from '@/lib/appearance-preferences'
import { usePlaybackNetworkPreferences } from '@/lib/playback-network-preferences'
import { useServerSession } from '@/lib/server-session'
import { audioCacheStats } from '@/player/audio-cache'
import { formatBytes } from '@/player/audio-cache-policy'
import { formatServerAddress } from '@/lib/server-address-format'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

const FEEDBACK_EMAIL = 'arieachao@163.com'

/** 版本号从 app.json 读，不硬编码 —— 写死会在发新版后静默显示错版本 */
const APP_VERSION = Constants.expoConfig?.version ?? '—'

/**
 * 设置页：对齐 Apple Music 风格的一级页签。
 * 1. 顶部用户卡：圆形字母头像 + 账号名 +「管理员/普通用户」胶囊徽章 + 归属系统（fnOS）
 * 2. 偏好设置卡片：外观主题、播放设置、服务器线路、缓存（自动缓存/容量上限/歌曲首数/清理）
 *    —— **不提供音质选项**：当前唯一的后端（飞牛）转码恒输出无损 FLAC、服务端忽略码率参数，
 *    给了选项也不生效（详见 docs/fnos-transcode.md 与执行计划第 7 轮）。管线留着，
 *    等真有支持码率档位的后端（Emby/Jellyfin 那类）再把入口放回来。
 * 3. 帮助与关于卡片（3项）：问题反馈、支持作者、关于
 * 4. 账号退出卡片（1项）：退出登录
 *
 * 服务器线路只管理当前服务器的备选访问地址，不负责切换服务器账号。
 */
export function SettingsScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const router = useRouter()
  const { provider, connection, signOut } = useServerSession()
  const bottom = useBottomSpace()
  const themeMode = useAppearancePreferences((s) => s.themeMode)
  const allowCellularPlayback = usePlaybackNetworkPreferences((s) => s.allowCellularPlayback)
  const currentThemeLabel = THEME_MODE_OPTIONS.find((t) => t.value === themeMode)?.label ?? '跟随系统'
  const audioCache = audioCacheStats()

  const me = useQuery({
    queryKey: ['me', connection?.id],
    enabled: Boolean(provider),
    queryFn: () => provider!.currentUser(),
    staleTime: 10 * 60_000,
  })

  const userName = me.data?.name ?? connection?.username ?? '未登录'
  const backendName = connection?.providerId === 'fnos' ? 'fnOS' : (connection?.providerId ?? '未知后端')
  const routing = provider?.routing
  const subscribe = useCallback((listener: () => void) => routing?.subscribe(listener) ?? (() => undefined), [routing])
  const snapshot = useCallback(() => routing?.getActiveBaseUrl() ?? connection?.baseUrl ?? '', [connection?.baseUrl, routing])
  const activeUrl = useSyncExternalStore(subscribe, snapshot, snapshot)
  const [showUrl, setShowUrl] = useState(false)
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

        <View style={styles.cardsContainer}>
          {/* 顶部用户卡片 */}
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{userName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>
                  {userName}
                </Text>
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>
                    {me.data?.isAdmin ? '管理员' : '普通用户'}
                  </Text>
                </View>
              </View>
              <View style={styles.userMetaRow}>
                <Text numberOfLines={1} style={styles.userMeta}>
                  {backendName} · {showUrl ? formatServerAddress(activeUrl) : '••••••'}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setShowUrl((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showUrl ? '隐藏服务器地址' : '显示服务器地址'}
                  style={styles.eyeButton}
                >
                  <Icon
                    name={showUrl ? 'eye' : 'eyeOff'}
                    size={14}
                    color={showUrl ? colors.stateSelected : colors.textTertiary}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <SettingsRow
              icon="appearance"
              label="外观主题"
              value={currentThemeLabel}
              onPress={() => router.push('/(tabs)/settings/appearance')}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="playbackSettings"
              label="播放设置"
              value={allowCellularPlayback ? 'Wi-Fi 与蜂窝网络' : '仅 Wi-Fi'}
              onPress={() => router.push('/(tabs)/settings/network')}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="cache"
              label="缓存"
              value={formatBytes(audioCache.bytes)}
              onPress={() => router.push('/(tabs)/settings/cache')}
            />
          </View>

          <View style={styles.card}>
            <SettingsRow
              icon="server"
              label="服务器线路"
              onPress={() => router.push('/(tabs)/settings/server-routes')}
            />
            <View style={styles.divider} />
            <SettingsRow
              icon="dataSource"
              label="外部数据源"
              onPress={() => router.push('/(tabs)/settings/external-sources')}
            />
            {me.data?.isAdmin ? (
              <>
                <View style={styles.divider} />
                <SettingsRow
                  icon="libraryManage"
                  label="曲库管理"
                  onPress={() => router.push('/(tabs)/settings/library')}
                />
              </>
            ) : null}
          </View>

          <View style={styles.card}>
            <SettingsRow icon="feedback" label="问题反馈" onPress={onFeedback} />
            <View style={styles.divider} />
            <SettingsRow icon="heartOutline" label="支持作者" onPress={onSupport} />
            <View style={styles.divider} />
            <SettingsRow icon="about" label="关于" value={`v${APP_VERSION}`} onPress={onAbout} />
            <View style={styles.divider} />
            <SettingsRow
              icon="document"
              label="崩溃日志"
              onPress={() => router.push('/(tabs)/settings/crash-log')}
            />
          </View>

          <View style={styles.card}>
            <SettingsRow
              icon="signOut"
              label="退出登录"
              onPress={onSignOut}
              showChevron={false}
            />
          </View>

          <Text style={styles.footer}>轻简音乐 · 为飞牛音乐打造的移动客户端</Text>
        </View>
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
  showChevron?: boolean
}

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  accessibilityLabel,
  showChevron = true,
}: SettingsRowProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const { width, fontScale } = useWindowDimensions()
  const stacked = fontScale > 1.2 || width < 380
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgListItemHover }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={value ? { text: value } : undefined}
    >
      <Icon name={icon} size={22} color={colors.textSecondary} />
      <Text style={[styles.label, stacked && styles.labelStacked]}>{label}</Text>
      {value || showChevron ? (
        <View style={styles.rowValueContainer}>
          {value ? <Text style={[styles.value, stacked && styles.valueStacked]}>{value}</Text> : null}
          {showChevron ? <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} /> : null}
        </View>
      ) : null}
    </Pressable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
  },
  cardsContainer: {
    marginTop: spacing.sm,
    gap: spacing.lg,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.bgAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  userName: {
    ...typography.headline,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  adminBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  adminBadgeText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.badgeText,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userMeta: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  eyeButton: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginLeft: 52,
  },
  label: {
    ...typography.callout,
    color: colors.textPrimary,
    flex: 1,
  },
  labelStacked: { flexBasis: 'auto', flexGrow: 0 },
  rowValueContainer: {
    flexDirection: 'row',
    marginLeft: 'auto',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  value: {
    ...typography.subhead,
    color: colors.textTertiary,
    textAlign: 'right',
  },
  valueStacked: { maxWidth: '100%', textAlign: 'left' },
  footer: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
}))
