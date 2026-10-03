import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useRouter } from 'expo-router'
import { Icon, iconSize, type IconName } from '@/components/icon'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

interface QuickAssetRowProps {
  isInteracting?: () => boolean
}
const cards: { key: string; label: string; icon: IconName; href: '/home/favorites' | '/home/downloaded' }[] = [
  { key: 'favorites', label: '我喜欢的', icon: 'heartOutline', href: '/home/favorites' },
  { key: 'downloaded', label: '已下载', icon: 'download', href: '/home/downloaded' },
]

/** 唱片抽屉右侧：喜欢的音乐与离线下载。 */
export function QuickAssetRow({ isInteracting }: QuickAssetRowProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const router = useRouter()
  return (
    <View style={styles.column}>
      {cards.map((card) => (
        <Pressable
          key={card.key}
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          onPress={() => {
            if (isInteracting?.()) return
            router.push(card.href)
          }}
          accessibilityRole="button"
          accessibilityLabel={card.label}
        >
          <View style={styles.cornerGlow} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Svg width={140} height={100} viewBox="0 0 140 100">
              <Defs><RadialGradient id={`assetGlow-${card.key}`}>
                <Stop offset="0" stopColor={card.key === 'favorites' ? colors.homeFavoritesGlow : colors.homeDownloadsGlow} stopOpacity={0.22} />
                <Stop offset="0.45" stopColor={card.key === 'favorites' ? colors.homeFavoritesGlow : colors.homeDownloadsGlow} stopOpacity={0.09} />
                <Stop offset="1" stopColor={card.key === 'favorites' ? colors.homeFavoritesGlow : colors.homeDownloadsGlow} stopOpacity={0} />
              </RadialGradient></Defs>
              <Ellipse cx={70} cy={50} rx={70} ry={50} fill={`url(#assetGlow-${card.key})`} />
            </Svg>
          </View>
          <View style={styles.edgeLight} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Svg width="100%" height="100%">
              <Defs><LinearGradient id={`assetEdge-${card.key}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0" stopColor={card.key === 'favorites' ? colors.homeFavoritesEdge : colors.homeDownloadsEdge} stopOpacity={0.4} />
                <Stop offset="0.16" stopColor={card.key === 'favorites' ? colors.homeFavoritesEdge : colors.homeDownloadsEdge} stopOpacity={0.15} />
                <Stop offset="0.32" stopColor={card.key === 'favorites' ? colors.homeFavoritesEdge : colors.homeDownloadsEdge} stopOpacity={0} />
                <Stop offset="0.72" stopColor={card.key === 'favorites' ? colors.homeFavoritesEdge : colors.homeDownloadsEdge} stopOpacity={0} />
                <Stop offset="0.93" stopColor={card.key === 'favorites' ? colors.homeFavoritesEdge : colors.homeDownloadsEdge} stopOpacity={0.18} />
                <Stop offset="1" stopColor={card.key === 'favorites' ? colors.homeFavoritesEdge : colors.homeDownloadsEdge} stopOpacity={0.05} />
              </LinearGradient></Defs>
              <Rect width="100%" height="100%" rx={radius.lg - 1} fill="none" stroke={`url(#assetEdge-${card.key})`} strokeWidth={1.2} />
            </Svg>
          </View>
          <Icon name={card.icon} size={iconSize.md} color={colors.actionText} />
          <Text style={styles.title}>{card.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}
const useStyles = createThemedStyles((colors) => ({
  column: { flex: 1, minWidth: 0, gap: 10 },
  tile: {
    flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBorder, overflow: 'hidden', borderRadius: radius.lg, padding: spacing.md,
  },
  cornerGlow: { opacity: 0.14, position: 'absolute', width: 140, height: 100, right: -40, bottom: -42 },
  edgeLight: { opacity: 0.4, position: 'absolute', top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
  pressed: { opacity: 0.78 },
  title: { ...typography.footnote, fontSize: 14, fontWeight: '600', color: colors.textPrimary, flex: 1 },
}))
