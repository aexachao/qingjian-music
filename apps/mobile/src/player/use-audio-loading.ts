import { State, useIsPlaying, usePlaybackState } from 'react-native-track-player'
import { usePlayerStore } from './store'

/**
 * 统一监听音频加载/缓冲/转码中状态。
 * 当处于 loading 状态时，播放/暂停按钮呈现 loading 旋转指示器。
 */
export function useIsAudioLoading(): boolean {
  const playbackState = usePlaybackState()
  const { bufferingDuringPlay } = useIsPlaying()
  const storeLoading = usePlayerStore((s) => s.isLoadingAudio)

  const state = playbackState.state
  const isNativeLoading =
    state === State.Loading ||
    state === State.Buffering ||
    Boolean(bufferingDuringPlay)

  return Boolean(storeLoading || isNativeLoading)
}
