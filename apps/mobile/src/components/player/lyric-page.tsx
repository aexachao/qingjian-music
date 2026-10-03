import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useActiveTrack, useIsPlaying, useProgress } from 'react-native-track-player'
import type { SharedValue } from 'react-native-reanimated'
import { IconButton, iconSize } from '@/components/icon'
import { LyricAdjustmentSheet } from '@/components/player/lyric-adjustment-sheet'
import { LyricView } from '@/components/lyric-view'
import { useToast } from '@/components/toast'
import { useLyricOffset } from '@/lib/lyric-offset'
import { seekAndPlay as seekLyricAndPlay } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { getThemeColors, spacing } from '@/theme/tokens'

const darkColors = getThemeColors('dark')

const LYRIC_TICK_MS = 100
const LYRIC_IDLE_TICK_MS = 200

export interface LyricPageProps {
  trackId: string
  bottomSpace?: number
  onTopStateChange?: (atTop: boolean) => void
  active?: boolean
  translateY?: SharedValue<number>
  onDismiss?: () => void
  playing?: boolean
  isLandscape?: boolean
}

export function LyricPage({
  trackId,
  bottomSpace,
  onTopStateChange,
  active,
  translateY,
  onDismiss,
  playing: propPlaying,
  isLandscape = false,
}: LyricPageProps) {
  const toast = useToast()
  const { playing: hookPlaying } = useIsPlaying()
  const playing = propPlaying ?? hookPlaying
  const progress = useProgress(active ? LYRIC_TICK_MS : LYRIC_IDLE_TICK_MS)
  const activeTrack = useActiveTrack()
  const current = usePlayerStore(selectCurrent)
  const lyricOffset = useLyricOffset(trackId)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const seekAndPlay = useCallback(
    (seconds: number) => {
      void seekLyricAndPlay(seconds).catch((error: unknown) =>
        toast(error instanceof Error ? error.message : '歌词跳转失败'),
      )
    },
    [toast],
  )

  return (
    <View style={[styles.stageFill, !isLandscape && styles.stageFillPortrait]}>
      <LyricView
        key={trackId}
        trackId={trackId}
        positionMs={
          activeTrack?.id === current?.qid ? progress.position * 1000 : Number.NEGATIVE_INFINITY
        }
        offsetMs={lyricOffset.offsetMs}
        onSeek={seekAndPlay}
        songTitle={current?.title}
        songArtist={current?.artistText}
        bottomSpace={bottomSpace}
        onTopStateChange={onTopStateChange}
        active={active}
        translateY={translateY}
        onDismiss={onDismiss}
        playing={playing}
      />
      {active ? (
        <View style={styles.lyricActions}>
          <IconButton
            name="lyricAdjust"
            size={iconSize.lg}
            color={darkColors.iconMid}
            disabled={!lyricOffset.canAdjust}
            onPress={() => setAdjustOpen(true)}
            accessibilityLabel="调整歌词时间"
          />
        </View>
      ) : null}
      <LyricAdjustmentSheet
        visible={adjustOpen}
        offsetMs={lyricOffset.offsetMs}
        onAdjust={lyricOffset.adjust}
        onClose={() => setAdjustOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stageFill: {
    flex: 1,
  },
  stageFillPortrait: {
    paddingHorizontal: spacing.xl,
  },
  lyricActions: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
  },
})
