import { create } from 'zustand'

/** User intent is independent of buffering/paused native state. Never persist auto-resume intent. */
export const usePlaybackIntent = create(() => ({ revision: 0, wantsPlay: false, waitingForNetwork: false, requestedPosition: undefined as number | undefined, networkCheckpoint: undefined as { qid: string; position: number } | undefined }))
export function getPlaybackIntent() { return usePlaybackIntent.getState() }
export function setPlaybackIntent(wantsPlay: boolean, requestedPosition?: number): void {
  usePlaybackIntent.setState({ revision: getPlaybackIntent().revision + 1, wantsPlay, waitingForNetwork: false, requestedPosition })
}
export function setWaitingForNetwork(waitingForNetwork: boolean): void {
  usePlaybackIntent.setState({ waitingForNetwork })
}
export function subscribePlaybackIntent(listener: () => void): () => void {
  return usePlaybackIntent.subscribe((state, previous) => {
    if (state.revision !== previous.revision) listener()
  })
}

export function clearRequestedPlaybackPosition(revision: number): void {
  if (getPlaybackIntent().revision === revision) usePlaybackIntent.setState({ requestedPosition: undefined })
}

export function setNetworkPlaybackCheckpoint(networkCheckpoint: { qid: string; position: number } | undefined): void {
  usePlaybackIntent.setState({ networkCheckpoint })
}
