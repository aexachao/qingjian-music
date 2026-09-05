import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useIsPlaying } from 'react-native-track-player'
import { CoverImage } from '@/components/cover-image'
import { IconButton, iconSize } from '@/components/icon'
import { skipToNextSafe, togglePlay } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 迷你播放条：贴在内容底部，点击展开正在播放页 */
export function MiniPlayer() {
  const router = useRouter()
  const current = usePlayerStore(selectCurrent)
  const { playing } = useIsPlaying()

  if (!current) return null

  return (
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
      {/* 次级控制用 lg，命中区由 IconButton 撑到 44×44；传输控制统一实心 */}
      <IconButton
        name={playing ? 'pause' : 'play'}
        size={iconSize.lg}
        filled
        color={colors.iconBright}
        onPress={() => void togglePlay()}
        accessibilityLabel={playing ? '暂停' : '播放'}
      />
      <IconButton
        name="next"
        size={iconSize.lg}
        filled
        color={colors.iconMid}
        onPress={() => void skipToNextSafe()}
        accessibilityLabel="下一首"
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgButtonSecondary,
  },
  text: { flex: 1, gap: 2 },
  title: { ...typography.subhead, color: colors.textPrimary },
  artist: { ...typography.caption, color: colors.textSecondary },
})
