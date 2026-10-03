import { startLyricPrefetch } from './lyric-prefetch'
import { getPlaybackIntent } from './playback-intent'
import { handleNetworkPlaybackFailure, startPlaybackNetworkMonitor } from './network-recovery'
import { startPlaybackConnectionMonitor } from './network-access'
import { useCallback, useEffect, useRef } from 'react'
import TrackPlayer, { Event, State, useTrackPlayerEvents } from 'react-native-track-player'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/toast'
import { useToggleFavorite } from '@/lib/favorites'
import { reconcileDownloads } from '@/player/downloads'
import { useServerSession } from '@/lib/server-session'
import { recordTasteSignal } from '@/lib/taste-profile-store'
import { classifyPlaybackOutcome } from '@qj/core-domain'
import {
  clearForcedTranscode,
  cycleCurrentToQueueEnd,
  ensureTranscodeForIndex,
  extendWithRadio,
  fillFromListFeed,
  fillRadio,
  hasPendingListFeed,
  isRestoringSession,
  markForcedTranscode,
  pausePlayback,
  refreshArtist,
  refreshArtwork,
  removeConsumedNativeTrack,
  rememberProvider,
  restoreQueuedPlayback,
  schedulePrefetch,
  takePendingHistoryActivation,
  takePendingPreviousActivation,
} from './controller'
import { readPlaybackSnapshot, startPlaybackPersistence } from './persist'
import {
  exceedsAutoSkipBudget,
  isNetworkFailure,
  normalizePlaybackError,
  pruneAutoSkips,
} from './playback-error-policy'
import { ensurePlayer, setLikeState } from './setup'
import { selectCurrent, usePlayerStore } from './store'
import { cachedTranscodeUri, invalidateTranscodeProduct } from './transcode-cache'
import { setSessionLostHandler } from './transcode-session'

import { addVolumeListener } from '../../modules/system-volume'

/** RNTP 偶尔会为同一次切歌连发两次事件，同一首这个时间窗内只上报一次 */
const REPORT_DEDUPE_MS = 5_000

/**
 * 把 RNTP 的事件同步回 store：切歌时更新下标并补锁屏封面。
 * 放在根布局挂一次即可。
 */
export function PlayerBridge() {
  const { provider, connection } = useServerSession()
  const queryClient = useQueryClient()
  const toast = useToast()
  const toggleFavorite = useToggleFavorite()
  const isFavorite = usePlayerStore(selectCurrent)?.isFavorite ?? false
  const lastReport = useRef<{ qid: string; at: number } | null>(null)
  /** 最近几次「自动跳歌」的时间戳，用来发现「连着好几首都放不出来」 */
  const recentAutoSkips = useRef<number[]>([])

  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    // Network classification must be available even while RNTP is still being
    // initialised; otherwise a first-tap play can be rejected as "unknown".
    let stopInitialConnectionMonitor: (() => void) | undefined = startPlaybackConnectionMonitor()
    void ensurePlayer().then(() => {
      if (!disposed) {
        // startPlaybackNetworkMonitor installs its listener synchronously, so
        // the hand-off never leaves a gap and never drops NWPathMonitor events.
        stop = startPlaybackNetworkMonitor(toast)
        stopInitialConnectionMonitor?.()
        stopInitialConnectionMonitor = undefined
      }
    }).catch((error: unknown) => console.warn('初始化播放网络监听失败', error))
    return () => { disposed = true; stopInitialConnectionMonitor?.(); stop?.() }
  }, [toast])

  // 全局持续监听系统音量变化，确保进入播放页时能立即可用最新的真实系统音量
  useEffect(() => {
    const sub = addVolumeListener(() => {})
    return () => sub.remove()
  }, [])

  // 启动对账：App 被杀死期间系统可能已经把下载下完（甚至拼好），
  // 这里把它们补登记进登记表，否则会出现「文件在磁盘上、App 里却显示未下载」。
  useEffect(() => {
    void reconcileDownloads().catch((error: unknown) => console.warn('下载恢复失败', error))
  }, [])

  // 当前曲目的收藏状态同步给系统播放控制，锁屏 / 车机上的心形按钮才有正确的开关态
  useEffect(() => {
    void setLikeState(isFavorite).catch((error: unknown) => {
      console.warn('同步收藏状态到系统播放控制失败', error)
    })
  }, [isFavorite])

  useEffect(() => {
    rememberProvider(provider)
  }, [provider])

  useEffect(() => {
    if (!provider || !connection?.id) return
    return startLyricPrefetch(provider, connection.id, queryClient)
  }, [provider, connection?.id, queryClient])

  /**
   * 上报起播。飞牛只认「起播」这一个事件（没有进度上报），
   * 上报成功后让「最近播放」失效，回到音乐库就能看到刚听的这首。
   */
  const reportPlay = useCallback(
    (index: number, qid?: string) => {
      // 冷启动恢复会触发一次换歌事件，但那不是真的起播，别上报
      if (isRestoringSession()) return
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

  /**
   * 播放失败后的自动跳歌。
   *
   * 加预算的原因：错误处理里直接 `skipToNext()` 会形成「跳一首 → 那首也失败 →
   * 再跳」的循环，几秒钟就能把整个队列静默烧完，用户只看到歌名飞快地跳、
   * 什么都没响。所以窗口内跳够上限就停下，把问题明确报出来。
   */
  const skipAfterFailure = useCallback(
    (message: string) => {
      const now = Date.now()
      if (exceedsAutoSkipBudget(recentAutoSkips.current, now)) {
        recentAutoSkips.current = []
        console.warn('连续多首曲目播放失败，已停止自动跳歌')
        toast('多首曲目都无法播放，请检查网络或服务器后重试')
        void pausePlayback().catch(() => undefined)
        return
      }
      recentAutoSkips.current = [...pruneAutoSkips(recentAutoSkips.current, now), now]
      toast(message)
      void TrackPlayer.skipToNext().catch(() => undefined)
    },
    [toast],
  )

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged, Event.PlaybackQueueEnded, Event.PlaybackError, Event.PlaybackState, Event.RemoteLike], async (event) => {
    // While a newer target is being prepared, old native events must not handle
    // errors/end-of-queue against the newly displayed song or roll selection back.
    const pending = usePlayerStore.getState().pendingCurrent
    if (pending) {
      if (event.type === Event.PlaybackError || event.type === Event.PlaybackQueueEnded || event.type === Event.PlaybackState) return
      if (event.type === Event.PlaybackActiveTrackChanged && event.track?.id !== pending.qid) return
    }
    // 真的放出来了：撤掉之前因失败打上的「强制转码」标记。
    // 标记是永久的，误打一次会把这首之后每次播放都钉在转码路径上，这里兜住。
    if (event.type === Event.PlaybackState && event.state === State.Playing) {
      const { queue, index } = usePlayerStore.getState()
      const item = queue[index]
      if (item) clearForcedTranscode(item.qid)
      return
    }
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
    if (event.type === Event.PlaybackQueueEnded) {
      const { queue, index, playMode } = usePlayerStore.getState()
      const currentItem = queue[index >= 0 ? index : 0]
      if (currentItem && playMode.repeat === 'off') {
        usePlayerStore.getState().setPlaybackEnded(true)
        usePlayerStore.getState().appendHistoryItem(currentItem)
        // 整个队列放完：最后这首听到尾 → 强正信号喂给画像
        if (currentItem.track && connection && !isRestoringSession()) {
          recordTasteSignal(connection.id, currentItem.track, 'completed')
        }
      }
      return
    }
    if (event.type === Event.PlaybackActiveTrackChanged) {
      const qid = typeof event.track?.id === 'string' ? event.track.id : undefined
      const { queue, index: previousIndex, playMode } = usePlayerStore.getState()
      const byId = qid ? queue.findIndex((item) => item.qid === qid) : -1
      const previousItem = byId < 0 && qid ? takePendingPreviousActivation(qid) : undefined
      const historyItem = byId < 0 && qid ? takePendingHistoryActivation(qid) : undefined
      if (byId < 0 && !previousItem && !historyItem) return
      // 离开「正在播放」的那首：用 lastTrack + lastPosition 分类结果，喂给口味画像。
      // 恢复会话期间不记（重建队列会触发换歌事件，用户还没真听）。
      const lastQid = typeof event.lastTrack?.id === 'string' ? event.lastTrack.id : undefined
      // Rebuilding the same native asset (network policy/recovery) is not a song change.
      if (qid && lastQid === qid) return
      const leaving = lastQid ? queue.find((item) => item.qid === lastQid) : undefined
      if (leaving?.track && connection && !isRestoringSession()) {
        const lastPositionMs =
          typeof event.lastPosition === 'number' ? event.lastPosition * 1000 : undefined
        const outcome = classifyPlaybackOutcome(lastPositionMs, leaving.durationMs)
        if (outcome) recordTasteSignal(connection.id, leaving.track, outcome)
      }
      // 优先用曲目 id 反查下标：RNTP 换队列时下标会短暂漂移，光看 index 会跟错曲目
      const index = byId >= 0 ? byId : 0
      if (index < 0) return
      // 自然播完由 RNTP 先激活下一首：此时把旧当前追加历史并处理队列流转。
      if (index > 0 && previousIndex === 0) {
        const oldCurrent = queue[0]
        usePlayerStore.getState().activateIndex(index)
        if (playMode.repeat === 'queue' && oldCurrent) {
          void cycleCurrentToQueueEnd(oldCurrent).catch((error: unknown) => console.warn('循环队列更新失败', error))
        } else {
          if (oldCurrent) void removeConsumedNativeTrack(oldCurrent.qid)
        }
      } else if (index === 0 && previousIndex === 0 && qid && queue[0]?.qid !== qid) {
        if (previousItem) {
          usePlayerStore.getState().restorePreviousTracks(previousItem.items, previousItem.historyIds)
          // 上一首恢复时，原当前曲目顺延到 index 1 作为待播曲目，保留在原生队列中，不得 remove([1])
        } else {
          // 历史点播会先把新 occurrence 插到 RNTP 队头；事件到达时再原子同步 store。
          if (historyItem) usePlayerStore.getState().activateHistoryItem(historyItem, qid)
          if (queue[0]) void removeConsumedNativeTrack(queue[0].qid)
        }
      } else {
        usePlayerStore.getState().setIndex(index)
      }
      const activeIndex = index > 0 && previousIndex === 0 ? 0 : index
      void refreshArtwork(activeIndex)
      void refreshArtist(activeIndex)
      reportPlay(activeIndex, qid)
      // 冷启动恢复永远保持暂停；正常切歌或播放错误重试才续播。
      void ensureTranscodeForIndex(activeIndex, { resumePlayback: !isRestoringSession() }).catch((error: unknown) => {
        console.warn('转码会话切换失败', error)
      }).finally(() => {
        // Consume a just-activated warm session before replacing the warm slot
        // with preparation for the following queue occurrence.
        if (usePlayerStore.getState().queue[usePlayerStore.getState().index]?.qid === qid) {
          schedulePrefetch(usePlayerStore.getState().index)
        }
      })
      // 续歌优先级：列表还没放完 → 静默补列表下一页（不看♾️，这是列表本身）；
      // 列表真末尾后，才看♾️无限播放 → 用全库漫游续命。
      if (provider && connection) {
        const { source, autoplay, queue } = usePlayerStore.getState()
        const nearEnd = activeIndex >= queue.length - 2
        if (source?.kind === 'radio' && autoplay) {
          void fillRadio(provider, connection.id)
        } else if (nearEnd && hasPendingListFeed()) {
          // 列表还有下页：无论♾️开没开都补（把列表放完）
          void fillFromListFeed(provider, connection.id).catch((error: unknown) => {
            console.warn('列表续拉失败', error)
          })
        } else if (autoplay && nearEnd) {
          // 列表真末尾 + 开了♾️：用漫游接着放
          void extendWithRadio(provider, connection.id).catch((error: unknown) => {
            console.warn('无限播放续歌失败', error)
          })
        }
      }
      return
    }
    if (event.type === Event.PlaybackError) {
      const { queue, index } = usePlayerStore.getState()
      const item = queue[index]
      // 不能直接读 event.code / event.message：iOS 侧原生只发 { error }，
      // 那两个字段恒为 undefined（详见 playback-error-policy.ts 的说明）。
      const failure = normalizePlaybackError(event)
      console.warn('播放失败', {
        code: failure.code,
        message: failure.message,
        index,
        qid: item?.qid,
        title: item?.title,
        format: item?.format,
        raw: failure.raw,
      })
      if (!item) return
      const errorRevision = getPlaybackIntent().revision
      if (await handleNetworkPlaybackFailure(failure)) return
      const latest = usePlayerStore.getState()
      if (latest.pendingCurrent || latest.queue[latest.index]?.qid !== item.qid || getPlaybackIntent().revision !== errorRevision) return

      /**
       * 如果这首是从「转码产物缓存」播的，先作废缓存再走后面的重试逻辑。
       * 不作废的话，重试会再次命中同一个坏文件 → 反复失败，而且跳歌预算会把队列烧掉。
       * 作废之后回落服务端转码，一次就能自愈。
       */
      if (cachedTranscodeUri(item.serverId, item.trackId)) {
        invalidateTranscodeProduct(item.serverId, item.trackId)
        console.warn('转码产物缓存播放失败，已作废并回落服务端转码', { qid: item.qid, title: item.title })
      }

      // 网络类失败：往后跳一首同样是放不出来，只会把队列静默烧完。
      // 原地停下并提示，让用户修网络后自己重试。
      if (isNetworkFailure(failure)) {
        toast('网络异常，播放失败，请检查网络后重试')
        return
      }

      // 原生解不了（格式白名单没覆盖到）时，改走服务端转码重试一次
      if (markForcedTranscode(item.qid)) {
        toast('当前格式无法直接播放，尝试转码重试…')
        void ensureTranscodeForIndex(index).catch((retryError: unknown) => {
          console.warn('转码重试失败', retryError)
          skipAfterFailure('转码重试失败，将跳过当前曲目')
        })
        return
      }
      // 已经重试过一次还是失败，跳过
      skipAfterFailure('播放失败，将跳过当前曲目')
    }
  })

  // 心跳失败说明服务端把转码任务回收了，原地重开一个会话继续播
  useEffect(() => {
    setSessionLostHandler((qid) => {
      const { queue, index } = usePlayerStore.getState()
      if (queue[index]?.qid !== qid) return
      void (async () => {
        // 心跳可能在暂停期间失败；重建会话只能延续当时的播放意图，不能擅自起播。
        const { state } = await TrackPlayer.getPlaybackState()
        await ensureTranscodeForIndex(index, { resumePlayback: state === State.Playing })
      })().catch((error: unknown) => {
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
    })().catch((error: unknown) => console.warn('初始化播放器失败', error))
    return () => {
      cancelled = true
    }
  }, [])

  // 冷启动恢复：队列是空的、快照属于当前这台服务器 → 重建播放队列。
  // 只加载不播放，迷你播放器显示出来，进度停在离开时的位置。
  useEffect(() => {
    if (!provider || !connection) return
    if (usePlayerStore.getState().queue.length > 0) return
    let cancelled = false
    void (async () => {
      await ensurePlayer()
      if (cancelled) return
      const snapshot = readPlaybackSnapshot()
      if (!snapshot || snapshot.serverId !== connection.id) return
      if (usePlayerStore.getState().queue.length > 0) return
      await restoreQueuedPlayback(provider, snapshot).catch((error: unknown) => {
        // 恢复失败就当新会话（转码 / 网络问题都别卡住启动）
        console.warn('恢复上次播放会话失败', error)
      })
    })().catch((error: unknown) => console.warn('初始化会话恢复失败', error))
    return () => {
      cancelled = true
    }
  }, [connection?.id, provider])

  // 播放会话持久化：切歌 / 模式变更防抖写，播放中定时补进度，退后台补一次
  useEffect(() => startPlaybackPersistence(), [])

  return null
}
