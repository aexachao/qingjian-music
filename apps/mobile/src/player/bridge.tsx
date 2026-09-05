import { useCallback, useEffect, useRef } from 'react'
import TrackPlayer, { Event, useTrackPlayerEvents } from 'react-native-track-player'
import { useQueryClient } from '@tanstack/react-query'
import { useServerSession } from '@/lib/server-session'
import { refreshArtwork, rememberProvider } from './controller'
import { ensurePlayer } from './setup'
import { usePlayerStore } from './store'

/** RNTP 偶尔会为同一次切歌连发两次事件，同一首这个时间窗内只上报一次 */
const REPORT_DEDUPE_MS = 5_000

/**
 * 把 RNTP 的事件同步回 store：切歌时更新下标并补锁屏封面。
 * 放在根布局挂一次即可。
 */
export function PlayerBridge() {
  const { provider, connection } = useServerSession()
  const queryClient = useQueryClient()
  const lastReport = useRef<{ qid: string; at: number } | null>(null)

  useEffect(() => {
    rememberProvider(provider)
  }, [provider])

  /**
   * 上报起播。飞牛只认「起播」这一个事件（没有进度上报），
   * 上报成功后让「最近播放」失效，回到资料库就能看到刚听的这首。
   */
  const reportPlay = useCallback(
    (index: number) => {
      const item = usePlayerStore.getState().queue[index]
      if (!item || !connection || !provider?.reportPlayback) return
      const now = Date.now()
      const last = lastReport.current
      if (last && last.qid === item.qid && now - last.at < REPORT_DEDUPE_MS) return
      lastReport.current = { qid: item.qid, at: now }
      void provider
        .reportPlayback({ trackId: item.trackId, positionMs: 0, finished: false })
        .then(() => queryClient.invalidateQueries({ queryKey: ['history', connection.id] }))
        .catch((error: unknown) => {
          // 上报失败不影响播放，只留日志
          console.warn('播放上报失败', error)
        })
    },
    [connection, provider, queryClient],
  )

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged, Event.PlaybackError], (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged) {
      const index = event.index ?? -1
      if (index < 0) return
      usePlayerStore.getState().setIndex(index)
      void refreshArtwork(index)
      reportPlay(index)
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
