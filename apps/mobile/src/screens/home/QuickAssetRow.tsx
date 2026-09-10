import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Icon, iconSize, type IconName } from '@/components/icon'
import { colors, fonts, radius, typography } from '@/theme/tokens'

interface QuickAssetRowProps {
  favoritesCount?: number
  isInteracting?: () => boolean
}

interface AssetCardItem {
  key: string
  label: string
  subtitle: string
  icon: IconName
  iconColor: string
  href: '/home/favorites' | '/home/history' | '/home/downloaded'
}

/**
 * 三等分圆角矩形瓷片功能区 (Quick Asset Tiles):
 * - 「我喜欢的」、「最近播放」、「已下载」三等分并列，平分整个屏幕宽度；
 * - 采用原生 Pressable（避免 Link asChild 的 Slot 剥除样式），赋予实心底色与高光描边；
 * - 「已下载」严禁展示缓存数量统计，副标题固定为「本地音乐」；
 * - 快捷菜单打开或防误触期间阻断跳转。
 */
export function QuickAssetRow({ favoritesCount, isInteracting }: QuickAssetRowProps) {
  const router = useRouter()

  const cards: AssetCardItem[] = [
    {
      key: 'favorites',
      label: '我喜欢的',
      subtitle: favoritesCount !== undefined && favoritesCount > 0 ? `${favoritesCount} 首` : '私房金曲',
      icon: 'heart',
      iconColor: colors.accent,
      href: '/home/favorites',
    },
    {
      key: 'history',
      label: '最近播放',
      subtitle: '听歌足迹',
      icon: 'recentlyPlayed',
      iconColor: colors.textPrimary,
      href: '/home/history',
    },
    {
      key: 'downloaded',
      label: '已下载',
      subtitle: '本地音乐',
      icon: 'downloaded',
      iconColor: colors.textPrimary,
      href: '/home/downloaded',
    },
  ]

  return (
    <View style={styles.row}>
      {cards.map((card) => (
        <Pressable
          key={card.key}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          onPress={() => {
            if (isInteracting?.()) return
            router.push(card.href)
          }}
          accessibilityRole="button"
          accessibilityLabel={`${card.label}，${card.subtitle}`}
        >
          <View style={styles.iconSlot}>
            <Icon name={card.icon} size={iconSize.md + 2} color={card.iconColor} />
          </View>
          <View style={styles.textGroup}>
            <Text numberOfLines={1} style={styles.title}>
              {card.label}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {card.subtitle}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
  },
  tile: {
    flex: 1,
    height: 84,
    // 清晰可见的次级实体底色与细腻边框，保证在 OLED 纯黑屏与深色模式下均具实体瓷片质感
    backgroundColor: '#1f1f23',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  tilePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  iconSlot: {
    alignItems: 'flex-start',
  },
  textGroup: {
    gap: 2,
  },
  title: {
    ...typography.headline,
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
  },
})
