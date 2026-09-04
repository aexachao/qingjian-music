import { useEffect } from 'react'
import TrackPlayer, { Event, useTrackPlayerEvents } from 'react-native-track-player'
import { useServerSession } from '@/lib/server-session'
import { refreshArtwork, rememberProvider } from './controller'
import { ensurePlayer } from './setup'
import { usePlayerStore } from './store'

/**
 * 把 RNTP 的事件同步回 store：切歌时更新下标并补锁屏封面。
 * 放在根布局挂一次即可。
 */
export function PlayerBridge() {
  const { provider } = useServerSession()

  useEffect(() => {
    rememberProvider(provider)
  }, [provider])

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged, Event.PlaybackError], (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged) {
      const index = event.index ?? -1
      if (index < 0) return
      usePlayerStore.getState().setIndex(index)
      void refreshArtwork(index)
      return
    }
    if (event.type === Event.PlaybackError) {
      console.warn('播放失败', event.code, event.message)
    }
  })

  // 启动就把播放器初始化好：RNTP 的任何查询（包括 useProgress / useIsPlaying）
  // 都必须在 setupPlayer 之后，否则会抛 "player is not initialized"
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensurePlayer()
      const index = await TrackPlayer.getActiveTrackIndex()
      if (!cancelled && typeof index === 'number') usePlayerStore.getState().setIndex(index)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return null
}
