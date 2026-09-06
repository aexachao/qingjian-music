import { useCallback, useEffect, useRef } from 'react'
import TrackPlayer, { Event, useTrackPlayerEvents } from 'react-native-track-player'
import { useQueryClient } from '@tanstack/react-query'
import { useToggleFavorite } from '@/lib/favorites'
import { useServerSession } from '@/lib/server-session'
import {
  ensureTranscodeForIndex,
  extendWithRadio,
  fillRadio,
  markForcedTranscode,
  refreshArtwork,
  rememberProvider,
  schedulePrefetch,
} from './controller'
import { ensurePlayer, setLikeState } from './setup'
import { selectCurrent, usePlayerStore } from './store'
import { setSessionLostHandler } from './transcode-session'

/** RNTP 偶尔会为同一次切歌连发两次事件，同一首这个时间窗内只上报一次 */
const REPORT_DEDUPE_MS = 5_000

/**
 * 把 RNTP 的事件同步回 store：切歌时更新下标并补锁屏封面。
 * 放在根布局挂一次即可。
 */
export function PlayerBridge() {
  const { provider, connection } = useServerSession()
  const queryClient = useQueryClient()
  const toggleFavorite = useToggleFavorite()
  const isFavorite = usePlayerStore(selectCurrent)?.isFavorite ?? false
  const lastReport = useRef<{ qid: string; at: number } | null>(null)

  // 当前曲目的收藏状态同步给系统播放控制，锁屏 / 车机上的心形按钮才有正确的开关态
  useEffect(() => {
    void setLikeState(isFavorite).catch((error: unknown) => {
      console.warn('同步收藏状态到系统播放控制失败', error)
    })
  }, [isFavorite])

  useEffect(() => {
    rememberProvider(provider)
  }, [provider])

  /**
   * 上报起播。飞牛只认「起播」这一个事件（没有进度上报），
   * 上报成功后让「最近播放」失效，回到资料库就能看到刚听的这首。
   */
  const reportPlay = useCallback(
    (index: number, qid?: string) => {
      const item = usePlayerStore.getState().queue[index]
      if (!item || !connection || !provider?.reportPlayback) return
      // 事件带的 id 和下标对不上说明队列刚被改过，这一次跳过，等下一次事件
      if (qid && item.qid !== qid) return
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

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged, Event.PlaybackError, Event.RemoteLike], (event) => {
    // 锁屏 / 车机上点了心形：切当前曲目的收藏，状态回流后 setLikeState 会把按钮点亮
    if (event.type === Event.RemoteLike) {
      const { queue, index } = usePlayerStore.getState()
      const item = queue[index]
      if (!item) return
      void toggleFavorite(item.trackId, !item.isFavorite).catch((error: unknown) => {
        console.warn('收藏失败', error)
      })
      return
    }
    if (event.type === Event.PlaybackActiveTrackChanged) {
      const qid = typeof event.track?.id === 'string' ? event.track.id : undefined
      const { queue } = usePlayerStore.getState()
      // 优先用曲目 id 反查下标：RNTP 换队列时下标会短暂漂移，光看 index 会跟错曲目
      const byId = qid ? queue.findIndex((item) => item.qid === qid) : -1
      const index = byId >= 0 ? byId : (event.index ?? -1)
      if (index < 0) return
      usePlayerStore.getState().setIndex(index)
      void refreshArtwork(index)
      reportPlay(index, qid)
      schedulePrefetch(index)
      // 这首必须转码就立刻换成 HLS，否则把上一首的转码会话收掉
      void ensureTranscodeForIndex(index).catch((error: unknown) => {
        console.warn('转码会话切换失败', error)
      })
      // 漫游电台：快到队尾就接着往后取，听着是无限的
      if (provider && connection) {
        const { source, autoplay, queue } = usePlayerStore.getState()
        if (source?.kind === 'radio') {
          void fillRadio(provider, connection.id)
        } else if (autoplay && index >= queue.length - 2) {
          // 无限播放：普通队列快播完了，用漫游接着放
          void extendWithRadio(provider, connection.id).catch((error: unknown) => {
            console.warn('无限播放续歌失败', error)
          })
        }
      }
      return
    }
    if (event.type === Event.PlaybackError) {
      console.warn('播放失败', event.code, event.message)
      // 原生解不了（格式白名单没覆盖到）时，改走服务端转码重试一次
      const { queue, index } = usePlayerStore.getState()
      const item = queue[index]
      if (!item || !markForcedTranscode(item.qid)) return
      void ensureTranscodeForIndex(index).catch((retryError: unknown) => {
        console.warn('转码重试失败', retryError)
      })
    }
  })

  // 心跳失败说明服务端把转码任务回收了，原地重开一个会话继续播
  useEffect(() => {
    setSessionLostHandler((qid) => {
      const { queue, index } = usePlayerStore.getState()
      if (queue[index]?.qid !== qid) return
      void ensureTranscodeForIndex(index).catch((error: unknown) => {
        console.warn('转码会话重建失败', error)
      })
    })
    return () => setSessionLostHandler(null)
  }, [])

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
