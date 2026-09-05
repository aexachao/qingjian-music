import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { useIsPlaying } from 'react-native-track-player'
import { CoverImage } from '@/components/cover-image'
import { IconButton, iconSize } from '@/components/icon'
import { skipToNextSafe, togglePlay } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** iOS 有真毛玻璃（UIVisualEffectView），Android 上 BlurView 不可靠，直接用实心底 */
const USE_BLUR = Platform.OS === 'ios'

/**
 * 迷你播放条：贴在页签上方，点击进入正在播放页。
 *
 * 底色必须**挡住**下面滚动的内容——之前用白 10% 的半透明，列表文字会透上来，
 * 和背景糊在一起。现在 iOS 是「毛玻璃 + 深色蒙层」，Android 是实心底，
 * 再加一圈描边把它和页面分开。
 */
export function MiniPlayer() {
  const router = useRouter()
  const current = usePlayerStore(selectCurrent)
  const { playing } = useIsPlaying()

  if (!current) return null

  return (
    <View style={styles.shell}>
      {USE_BLUR ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <Pressable
        style={styles.container}
        onPress={() => router.push('/player')}
        accessibilityRole="button"
        accessibilityLabel={`正在播放 ${current.title}，点击展开播放页`}
      >
        <CoverImage resource={current.artwork} size={44} borderRadius={radius.sm} />
        <View style={styles.text}>
          <Text numberOfLines={1} style={styles.title}>
            {current.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {current.artistText}
          </Text>
        </View>
        {/* 次级控制用 lg，命中区由 IconButton 撑到 44×44 */}
        <IconButton
          name={playing ? 'pause' : 'play'}
          size={iconSize.lg}
          color={colors.iconBright}
          onPress={() => void togglePlay()}
          accessibilityLabel={playing ? '暂停' : '播放'}
        />
        <IconButton
          name="next"
          size={iconSize.lg}
          color={colors.iconMid}
          onPress={() => void skipToNextSafe()}
          accessibilityLabel="下一首"
        />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
    // overflow 必须裁掉，否则毛玻璃会画到圆角外面
    overflow: 'hidden',
    backgroundColor: USE_BLUR ? colors.bgFloatingBlur : colors.bgFloatingSolid,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 2 },
  title: { ...typography.subhead, color: colors.textPrimary },
  artist: { ...typography.caption, color: colors.textSecondary },
})
