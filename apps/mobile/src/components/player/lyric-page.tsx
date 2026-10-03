import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useActiveTrack, useIsPlaying, useProgress } from 'react-native-track-player'
import type { SharedValue } from 'react-native-reanimated'
import { LyricAdjustmentSheet } from '@/components/player/lyric-adjustment-sheet'
import { LyricView } from '@/components/lyric-view'
import { useToast } from '@/components/toast'
import { useLyricOffset } from '@/lib/lyric-offset'
import { seekAndPlay as seekLyricAndPlay } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import type { LyricStageMaskProps } from './lyric-stage-mask'
import { spacing } from '@/theme/tokens'

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
  stageMask?: LyricStageMaskProps
  immersive?: boolean
  onLyricsReadyChange?: (ready: boolean) => void
  onLyricsErrorChange?: (error: boolean) => void
  onInteractionStart?: () => void
  onInteractionEnd?: () => void
  onReadingOverrideChange?: (manual: boolean) => void
  onReadingPositionChange?: (showReturn: boolean) => void
  onShareOpenChange?: (open: boolean) => void
  onModalOpenChange?: (open: boolean) => void
  onAdjustAvailabilityChange?: (enabled: boolean) => void
  onRegisterAdjustHandler?: (handler: () => void) => void
  onBlankTap?: () => void
  controlsVisible?: boolean
  foreground?: boolean
  followLocked?: boolean
  onFlingReveal?: () => void
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
  immersive = false,
  onLyricsReadyChange,
  onLyricsErrorChange,
  onInteractionStart,
  onInteractionEnd,
  onReadingOverrideChange,
  onReadingPositionChange,
  onShareOpenChange,
  onModalOpenChange,
  onAdjustAvailabilityChange,
  onRegisterAdjustHandler,
  onBlankTap,
  controlsVisible,
  foreground,
  followLocked,
  onFlingReveal,
  stageMask,
}: LyricPageProps) {
  const toast = useToast()
  const { playing: hookPlaying } = useIsPlaying()
  const playing = propPlaying ?? hookPlaying
  const progress = useProgress(active ? LYRIC_TICK_MS : LYRIC_IDLE_TICK_MS)
  const activeTrack = useActiveTrack()
  const current = usePlayerStore(selectCurrent)
  const lyricOffset = useLyricOffset(trackId)
  const [adjustOpen, setAdjustOpen] = useState(false)
  useEffect(() => { onAdjustAvailabilityChange?.(lyricOffset.canAdjust) }, [lyricOffset.canAdjust, onAdjustAvailabilityChange])
  const requestAdjust = useCallback(() => { setAdjustOpen(true); onModalOpenChange?.(true) }, [onModalOpenChange])
  useEffect(() => { onRegisterAdjustHandler?.(requestAdjust); return () => onRegisterAdjustHandler?.(() => {}) }, [onRegisterAdjustHandler, requestAdjust])
  useEffect(() => () => { if (adjustOpen) onModalOpenChange?.(false) }, [adjustOpen, onModalOpenChange])

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
        immersive={immersive}
        stageMask={stageMask}
        onLyricsReadyChange={onLyricsReadyChange}
        onLyricsErrorChange={onLyricsErrorChange}
        onInteractionStart={onInteractionStart}
        onInteractionEnd={onInteractionEnd}
        onReadingOverrideChange={onReadingOverrideChange}
        onReadingPositionChange={onReadingPositionChange}
        onShareOpenChange={onShareOpenChange}
        onBlankTap={onBlankTap}
        controlsVisible={controlsVisible}
        foreground={foreground}
        followLocked={followLocked}
        onFlingReveal={onFlingReveal}
      />
      <LyricAdjustmentSheet
        visible={adjustOpen}
        offsetMs={lyricOffset.offsetMs}
        onAdjust={lyricOffset.adjust}
        onClose={() => { setAdjustOpen(false); onModalOpenChange?.(false) }}
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
