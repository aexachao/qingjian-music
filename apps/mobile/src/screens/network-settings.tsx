import { ScrollView, Switch, Text, View } from 'react-native'
import { useBottomSpace } from '@/lib/bottom-space'
import { usePlaybackNetworkPreferences } from '@/lib/playback-network-preferences'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

const CELLULAR_PLAYBACK_DESCRIPTION =
  '关闭后可使用蜂窝网络播放。本地文件与主动下载不受此设置影响。'

export function NetworkSettingsScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const { allowCellularPlayback, setAllowCellularPlayback } = usePlaybackNetworkPreferences()
  const wifiOnly = !allowCellularPlayback

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>在线播放</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>仅通过 Wi-Fi 播放</Text>
              </View>
              <Switch
                value={wifiOnly}
                onValueChange={(enabled) => setAllowCellularPlayback(!enabled)}
                trackColor={{ false: colors.bgCardHover, true: colors.stateSelected }}
                thumbColor={colors.textOnAccent}
                accessibilityRole="switch"
                accessibilityState={{ checked: wifiOnly }}
                accessibilityLabel="仅通过 Wi-Fi 播放"
              />
            </View>
          </View>
          <Text style={styles.rowDescription}>{CELLULAR_PLAYBACK_DESCRIPTION}</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.textTertiary,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowLabel: {
    ...typography.callout,
    color: colors.textPrimary,
  },
  rowDescription: {
    ...typography.caption,
    color: colors.textTertiary,
    lineHeight: 18,
  },
}))
