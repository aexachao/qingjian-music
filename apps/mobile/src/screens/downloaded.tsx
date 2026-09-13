import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { EmptyState } from '@/components/list-states'
import { Icon, iconSize } from '@/components/icon'
import { audioCacheStats } from '@/player/audio-cache'
import { formatBytes } from '@/player/audio-cache-policy'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

/**
 * 已下载与本地缓存音乐页面
 */
export function DownloadedScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const [stats] = useState(() => audioCacheStats())

  if (stats.files === 0) {
    return <EmptyState text="暂无已下载歌曲（播放音频会自动缓存至本地）" />
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconSlot}>
          <Icon name="downloaded" size={iconSize.lg} color={colors.accent} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>已离线缓存 {stats.files} 首歌曲</Text>
          <Text style={styles.subtitle}>
            占用本地空间 {formatBytes(stats.bytes)} · 上限 2GB 智能管理
          </Text>
        </View>
      </View>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  container: {
    flex: 1,
    padding: spacing.pageMargin,
    backgroundColor: colors.bgPrimary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  iconSlot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceCardHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}))
