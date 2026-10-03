import type { PlayMode } from '@qj/core-domain'

export type PlayerToolbarBadge = {
  icon: 'shuffle' | 'repeat' | 'repeatOne'
  label: string
}

/** The queue toolbar badge mirrors the active shuffle/repeat mode, independent of autoplay. */
export function getPlayerToolbarBadge(playMode: PlayMode): PlayerToolbarBadge | null {
  if (playMode.repeat === 'one') return { icon: 'repeatOne', label: '单曲循环' }
  if (playMode.shuffle) return { icon: 'shuffle', label: '随机播放' }
  if (playMode.repeat === 'queue') return { icon: 'repeat', label: '列表循环' }
  return null
}
