import { useId, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useIsPlaying } from 'react-native-track-player'
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg'
import { AirplayRouteButton } from '../../../modules/airplay-button'
import { Icon, type IconName } from '@/components/icon'
import { LYRICS_FILLED_PATH, QUEUE_FILLED_PATH } from '@/components/player-mode-glyphs'
import { useToast } from '@/components/toast'
import { tap } from '@/lib/haptics'
import { skipToNextSafe, togglePlay } from '@/player/controller'
import { usePlaybackIntent } from '@/player/playback-intent'
import { useIsAudioLoading } from '@/player/use-audio-loading'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

type PlayerMode = 'cover' | 'lyrics' | 'list'

/** Selected mode glyphs are holes in the tinted tile, revealing the live backdrop. */
function ModeButton({ name, selected, label, onPress }: {
  name: 'lyrics' | 'queue'; selected: boolean; label: string; onPress: () => void
}) {
  const colors = useThemeColors()
  const styles = useStyles()
  const maskId = useId().replace(/:/g, '')
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }}
      onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {selected ? (
        <Svg width={44} height={44} viewBox="0 0 44 44">
          <Defs>
            <Mask id={maskId} x={0} y={0} width={44} height={44} maskUnits="userSpaceOnUse" maskType="luminance">
              <Rect width={44} height={44} fill="white" />
              <G transform="translate(10 10)">
                <Path d={name === 'lyrics' ? LYRICS_FILLED_PATH : QUEUE_FILLED_PATH} fill="black" fillRule="evenodd" />
              </G>
            </Mask>
          </Defs>
          <Rect width={44} height={44} rx={12} fill={colors.playerToolbarSelected} mask={`url(#${maskId})`} />
        </Svg>
      ) : <Icon name={name} size={24} color={colors.iconMid} filled={false} />}
    </Pressable>
  )
}

function TransportButton({ name, label, loading = false, onPress }: {
  name: IconName; label: string; loading?: boolean; onPress: () => void
}) {
  const colors = useThemeColors()
  const styles = useStyles()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: loading }}
      onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={styles.transport}>
        {loading ? <ActivityIndicator size="small" color={colors.iconMid} /> : <Icon name={name} size={20} color={colors.iconMid} filled />}
      </View>
    </Pressable>
  )
}

export function PlayerToolbar({ mode, onModeChange, bottomInset, compact = false }: {
  mode: PlayerMode; onModeChange: (mode: PlayerMode) => void; bottomInset: number; compact?: boolean
}) {
  const colors = useThemeColors()
  const styles = useStyles()
  const [routeName, setRouteName] = useState('')
  const inLyrics = mode === 'lyrics'
  return (
    <View style={[styles.toolbar, compact && styles.toolbarCompact, { paddingBottom: compact ? 0 : bottomInset + spacing.xs }]}>
      <View style={[styles.row, compact && styles.rowCompact]}>
        <ModeButton name="lyrics" selected={inLyrics} label="歌词" onPress={() => onModeChange(inLyrics ? 'cover' : 'lyrics')} />
        <AirplayRouteButton style={styles.button} tintColor={colors.iconMid}
          onRouteChange={({ nativeEvent }) => setRouteName(nativeEvent.external ? nativeEvent.name : '')} />
        <ModeButton name="queue" selected={mode === 'list'} label="播放队列" onPress={() => onModeChange(mode === 'list' ? 'cover' : 'list')} />
      </View>
      {/* In landscape compact mode, omit the routeCaption line to preserve strict 44pt height */}
      {!compact ? (
        <View style={styles.routeCaption}>
          {routeName ? <Text style={styles.routeName} numberOfLines={1} ellipsizeMode="middle" accessibilityLabel={`当前输出设备：${routeName}`}>{routeName}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

/** Playback actions belong to the lyric settings row, above the persistent toolbar. */
export function LyricsPlaybackControls() {
  const styles = useStyles()
  const toast = useToast()
  const { playing } = useIsPlaying()
  const networkWaiting = usePlaybackIntent((state) => state.waitingForNetwork)
  const loading = useIsAudioLoading()
  const run = (action: () => Promise<unknown>, fallback: string) => {
    tap()
    void action().catch((error: unknown) => toast(error instanceof Error ? error.message : fallback))
  }
  return (
    <View style={styles.lyricControls}>
      <TransportButton name={playing || networkWaiting ? 'pause' : 'play'}
        label={networkWaiting ? '取消网络恢复后续播' : playing ? '暂停' : '播放'} loading={loading && !networkWaiting}
        onPress={() => run(togglePlay, '播放操作失败，请重试')} />
      <TransportButton name="next" label="下一首" onPress={() => run(skipToNextSafe, '切换下一首失败，请重试')} />
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  toolbar: { paddingHorizontal: spacing.xl },
  toolbarCompact: { paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  rowCompact: { justifyContent: 'space-between' },
  lyricControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  transport: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.playerToolbarControl },
  pressed: { opacity: 0.65 },
  routeCaption: { height: 24, alignItems: 'center', justifyContent: 'center' },
  routeName: { ...typography.caption, color: colors.iconMid, textAlign: 'center', width: '100%' },
}))
