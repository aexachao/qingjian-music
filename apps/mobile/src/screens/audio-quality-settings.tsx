import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Icon, iconSize } from '@/components/icon'
import { OptionPickerModal, type OptionPickerItem } from '@/components/option-picker-modal'
import { useBottomSpace } from '@/lib/bottom-space'
import {
  useAudioQualityPreferences,
  type QualityOption,
  QUALITY_DESCRIPTIONS,
  QUALITY_LABELS,
} from '@/lib/audio-quality-preferences'
import { tap } from '@/lib/haptics'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

type QualityCategory = 'wifi' | 'cellular'

interface CategoryConfig {
  key: QualityCategory
  modalTitle: string
}

const CATEGORIES: CategoryConfig[] = [
  { key: 'wifi', modalTitle: 'Wi-Fi 播放音质' },
  { key: 'cellular', modalTitle: '移动网络播放音质' },
]

/** 选项文案与偏好模块共用一份，避免同一批字符串在两处各自漂移 */
const QUALITY_OPTIONS: OptionPickerItem<QualityOption>[] = (['original', 'standard'] as const).map((key) => ({
  key,
  title: QUALITY_LABELS[key],
  subtitle: QUALITY_DESCRIPTIONS[key],
}))

export function AudioQualitySettingsScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const { provider } = useServerSession()
  const {
    wifiQuality,
    cellularQuality,
    setWifiQuality,
    setCellularQuality,
  } = useAudioQualityPreferences()

  /**
   * 只有后端真的能按码率档位输出时，这个设置才有意义。
   * 飞牛为 false：转码恒输出无损 FLAC，服务端忽略 bitrate，
   * 选「标准音质」既省不了流量，又会把每首歌推上转码链路 —— 所以不给选项。
   */
  const supportsQualityTiers = provider?.capabilities.qualityTiers ?? false

  const [activeCategory, setActiveCategory] = useState<QualityCategory | null>(null)

  const currentConfig = CATEGORIES.find((c) => c.key === activeCategory)

  const getCurrentQuality = (cat: QualityCategory): QualityOption => {
    switch (cat) {
      case 'wifi':
        return wifiQuality
      case 'cellular':
        return cellularQuality
    }
  }

  const onSelectQuality = (opt: QualityOption) => {
    if (activeCategory === 'wifi') {
      setWifiQuality(opt)
    } else if (activeCategory === 'cellular') {
      setCellularQuality(opt)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {supportsQualityTiers ? (
          /* 卡片：在线播放（Wi-Fi / 移动网络） */
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                tap()
                setActiveCategory('wifi')
              }}
              accessibilityRole="button"
              accessibilityLabel={`Wi-Fi 播放音质，当前选择：${QUALITY_LABELS[wifiQuality]}`}
            >
              <Text style={styles.rowLabel}>Wi-Fi 播放</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>{QUALITY_LABELS[wifiQuality]}</Text>
                <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
              </View>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                tap()
                setActiveCategory('cellular')
              }}
              accessibilityRole="button"
              accessibilityLabel={`移动网络播放音质，当前选择：${QUALITY_LABELS[cellularQuality]}`}
            >
              <Text style={styles.rowLabel}>移动网络播放</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>{QUALITY_LABELS[cellularQuality]}</Text>
                <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
              </View>
            </Pressable>
          </View>
        ) : (
          /*
           * 后端只有一档输出（capabilities.qualityTiers 为 false）。
           * 不给「看起来能选、其实不生效」的选项 —— 那既是假功能，
           * 又会让用户以为选了标准音质，实际只是把播放推上更脆弱的转码链路。
           */
          <View style={styles.card}>
            <View style={styles.note}>
              <Text style={styles.noteTitle}>当前服务器只有一档音质</Text>
              <Text style={styles.noteBody}>
                这台服务器转码时始终输出原始无损音频，不会因为选择「标准音质」而降低码率，
                因此这里不提供音质选项。播放时只会在遇到设备无法直接解码的格式时才启用服务端转码。
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 复用统一的 OptionPickerModal 组件 */}
      <OptionPickerModal<QualityOption>
        visible={activeCategory !== null}
        title={currentConfig?.modalTitle ?? ''}
        options={QUALITY_OPTIONS}
        selectedKey={activeCategory ? getCurrentQuality(activeCategory) : undefined}
        onSelect={onSelectQuality}
        onClose={() => setActiveCategory(null)}
      />
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
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    overflow: 'hidden',
  },
  note: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  noteTitle: {
    ...typography.subhead,
    fontSize: 16,
    color: colors.textPrimary,
  },
  noteBody: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: colors.bgCardHover,
  },
  rowLabel: {
    ...typography.body,
    fontSize: 16,
    color: colors.textPrimary,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    ...typography.subhead,
    fontSize: 15,
    color: colors.textTertiary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderDefault,
    marginLeft: spacing.lg,
  },
}))
