import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon } from '@/components/icon'
import { useThemeColors } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

export function DetailActionCapsules({
  onPlay,
  onToggleFavorite,
  favorite,
  playLabel = '播放全部',
  canPlay = true,
  playDisabledLabel = '暂无歌曲',
}: {
  onPlay: () => void
  onToggleFavorite: () => void
  favorite: boolean
  playLabel?: string
  canPlay?: boolean
  playDisabledLabel?: string
}) {
  const colors = useThemeColors()
  return (
    <View style={styles.row}>
      <Pressable
        hitSlop={8}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.detailActionSurface, borderColor: colors.borderEmphasis }, pressed && styles.pressed]}
        onPress={onPlay}
        disabled={!canPlay}
        accessibilityRole="button"
        accessibilityLabel={canPlay ? playLabel : playDisabledLabel}
        accessibilityState={{ disabled: !canPlay }}
      >
        <Icon name="play" size={16} color={canPlay ? colors.textPrimary : colors.disabledText} filled />
        <Text style={[styles.label, { color: canPlay ? colors.textPrimary : colors.disabledText }]}>{canPlay ? playLabel : playDisabledLabel}</Text>
      </Pressable>
      <Pressable
        hitSlop={8}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.detailActionSurface, borderColor: colors.borderEmphasis }, pressed && styles.pressed]}
        onPress={onToggleFavorite}
        accessibilityRole="button"
        accessibilityLabel={favorite ? '取消喜欢' : '喜欢'}
        accessibilityState={{ selected: favorite }}
      >
        <Icon name="heart" size={16} color={favorite ? colors.like : colors.textPrimary} filled={favorite} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>{favorite ? '取消喜欢' : '喜欢'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%' },
  button: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { ...typography.subhead, fontSize: 15, lineHeight: 20, fontFamily: fonts.medium, fontWeight: '600' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
})
