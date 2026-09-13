import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Icon, iconSize } from '@/components/icon'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

interface HeroStationCardProps {
  onStartRadio: () => void
  startingRadio?: boolean
  totalTracks?: number
  isInteracting?: () => boolean
}

/**
 * 随心漫游卡片 (Hero Station Card):
 * 极简、通透的 Apple Music 电台卡片，一键唤醒全库盲听心流
 */
export function HeroStationCard({
  onStartRadio,
  startingRadio = false,
  totalTracks,
  isInteracting,
}: HeroStationCardProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const handlePress = useCallback(() => {
    if (isInteracting?.()) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onStartRadio()
  }, [isInteracting, onStartRadio])

  const subtitle =
    totalTracks !== undefined && totalTracks > 0
      ? `免挑歌心流 · 在 ${totalTracks.toLocaleString()} 首私藏中随机漫步`
      : '免挑歌心流 · 随机漫步私藏曲库'

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        startingRadio && styles.cardBusy,
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="随心漫游，随机播放整个音乐库"
      accessibilityState={{ busy: startingRadio }}
    >
      <View style={styles.textCol}>
        <Text style={styles.kicker}>STATION · 飞牛电台</Text>
        <Text style={styles.title}>随心漫游</Text>
        <Text numberOfLines={2} style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.playCircle}>
        <Icon name="play" size={iconSize.md + 2} color={colors.textOnAccent} />
      </View>
    </Pressable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBorder,
    borderRadius: radius.lg,
    padding: spacing.pageMargin,
    gap: spacing.md,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  cardBusy: {
    opacity: 0.6,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    ...typography.badge,
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.accent,
  },
  title: {
    ...typography.title,
    fontSize: 24,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.subhead,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
}))
