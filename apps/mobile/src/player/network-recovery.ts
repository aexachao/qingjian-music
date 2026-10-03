import { AppState } from 'react-native'
import * as Network from 'expo-network'
import TrackPlayer, { Event, State } from 'react-native-track-player'
import { usePlaybackNetworkPreferences } from '@/lib/playback-network-preferences'
import { getPlaybackIntent, setPlaybackIntent, setNetworkPlaybackCheckpoint, setWaitingForNetwork, subscribePlaybackIntent } from './playback-intent'
import { canUsePlaybackNetwork, getPlaybackConnection, refreshPlaybackConnection, updatePlaybackConnection } from './network-access'
import { isNetworkFailure, type NormalizedPlaybackError } from './playback-error-policy'
import { recoverPlaybackAfterNetwork, schedulePrefetch, stopPlaybackForNetwork, suspendPlaybackNetworkWork } from './controller'
import { applyPlaybackNetworkOptions } from './setup'
import { usePlayerStore } from './store'

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]
const ATTEMPT_TIMEOUT_MS = 20_000
// Route probes, an HLS preflight/cleanup and a 20s transcode start need
// their own deadline; the buffering watchdog and post-play grace stay at 20s.
const RECOVERY_REQUEST_TIMEOUT_MS = 45_000
interface Recovery { qid: string; revision: number; position: number; attempts: number; routeFailed?: boolean; notBefore?: number }
let receiveFailure: ((error: NormalizedPlaybackError) => Promise<boolean>) | undefined

/** The bridge must classify network errors before invalidating local files or skipping songs. */
export async function handleNetworkPlaybackFailure(error: NormalizedPlaybackError): Promise<boolean> {
  return receiveFailure?.(error) ?? false
}

export function startPlaybackNetworkMonitor(notify: (message: string) => void): () => void {
  let disposed = false
  let interrupted = false
  let pending: Recovery | undefined
  let epoch = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  let stallIdentity = ''
  let inFlight: Recovery | undefined
  let lastProgress: { qid: string; position: number } | undefined
  let deferredNotice: string | undefined
  let lastNotice = ''
  let lastConnection = getPlaybackConnection()
  let lastAllowCellular = usePlaybackNetworkPreferences.getState().allowCellularPlayback

  const show = (message: string) => {
    if (disposed || lastNotice === message) return
    lastNotice = message
    if (AppState.currentState === 'active') { deferredNotice = undefined; notify(message) }
    else deferredNotice = message
  }
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  let stoppedFor: string | undefined
  const current = () => {
    const { queue, index, pendingCurrent } = usePlayerStore.getState()
    return pendingCurrent ? undefined : queue[index]
  }
  const owns = (recovery: Recovery) => !disposed && current()?.qid === recovery.qid
    && getPlaybackIntent().revision === recovery.revision && getPlaybackIntent().wantsPlay
  const clearStallTimer = () => { if (stallTimer !== undefined) clearTimeout(stallTimer); stallTimer = undefined; stallIdentity = '' }
  const cancel = () => { deferredNotice = undefined; clearStallTimer(); epoch += 1; inFlight = undefined; pending = undefined; setWaitingForNetwork(false); clearTimer(); lastNotice = '' }
  const arm = (routeFailed = false) => {
    const item = current()
    const intent = getPlaybackIntent()
    if (!item || !intent.wantsPlay) return
    if (pending?.qid !== item.qid || pending.revision !== intent.revision) {
      pending = { qid: item.qid, revision: intent.revision,
        position: intent.requestedPosition ?? (lastProgress?.qid === item.qid ? lastProgress.position : 0), attempts: 0 }
    }
    if (routeFailed) pending.routeFailed = true
    setWaitingForNetwork(true)
    return pending
  }
  const schedule = (delay?: number) => {
    if (timer !== undefined) return
    if (!pending || !owns(pending) || interrupted || !canUsePlaybackNetwork() || inFlight) return
    if (pending.attempts >= RETRY_DELAYS.length) {
      setWaitingForNetwork(false)
      show('网络或服务器仍不可用，已停止自动重试，请稍后点播放重试')
      return
    }
    timer = setTimeout(() => { timer = undefined; void attempt() }, Math.max(delay ?? RETRY_DELAYS[pending.attempts]!, (pending.notBefore ?? 0) - Date.now()))
  }
  const attempt = async () => {
    const recovery = pending
    if (!recovery || !owns(recovery) || interrupted || !canUsePlaybackNetwork() || inFlight) return
    inFlight = recovery
    const owner = ++epoch
    const valid = () => owns(recovery) && epoch === owner && !interrupted && canUsePlaybackNetwork()
    let timeout: ReturnType<typeof setTimeout> | undefined
    let awaitingNativePlayback = false
    recovery.attempts += 1
    recovery.notBefore = undefined
    try {
      await Promise.race([
        (async () => {
          const [state, native] = await Promise.all([TrackPlayer.getPlaybackState(), TrackPlayer.getActiveTrack()])
          if (!valid() || native?.id !== recovery.qid) return
          // The native buffer recovered by itself; do not reload a song already playing.
          if (state.state === State.Playing) { if (getPlaybackIntent().networkCheckpoint?.qid === recovery.qid) setNetworkPlaybackCheckpoint(undefined); pending = undefined; setWaitingForNetwork(false); lastNotice = ''; schedulePrefetch(usePlayerStore.getState().index); return }
          const progress = await TrackPlayer.getProgress()
          if (!valid()) return
          if (getPlaybackIntent().requestedPosition === undefined && Number.isFinite(progress.position) && progress.position > 0) recovery.position = progress.position
          const recovered = await recoverPlaybackAfterNetwork(recovery.qid, recovery.position, valid, recovery.routeFailed === true || recovery.attempts > 1)
          if (recovered && valid()) {
            awaitingNativePlayback = true
            recovery.notBefore = Date.now() + ATTEMPT_TIMEOUT_MS
            if (getPlaybackIntent().networkCheckpoint?.qid === recovery.qid) setNetworkPlaybackCheckpoint(undefined)
            show('网络已恢复，正在恢复播放')
          }
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { if (epoch === owner) epoch += 1; reject(new Error('网络续播超时')) }, RECOVERY_REQUEST_TIMEOUT_MS)
        }),
      ])
    } catch (error) {
      if (owns(recovery)) console.warn('网络续播重试失败', error)
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      if (inFlight === recovery) inFlight = undefined
      if (!disposed && pending && owns(pending)) schedule(awaitingNativePlayback ? ATTEMPT_TIMEOUT_MS : undefined)
    }
  }

  const inspectNetwork = async (changed: boolean) => {
    const owner = epoch
    const item = current()
    const revision = getPlaybackIntent().revision
    if (!item) return
    const native = await TrackPlayer.getActiveTrack()
    if (disposed || owner !== epoch || current()?.qid !== item.qid || revision !== getPlaybackIntent().revision) return
    // Full local downloads/cache never need cellular permission or network recovery.
    if (native?.id !== item.qid) return
    if (typeof native.url === 'string' && /^(file|content):/i.test(native.url)) {
      pending = undefined; setWaitingForNetwork(false); clearTimer()
      return
    }
    const connection = getPlaybackConnection()
    if (!canUsePlaybackNetwork()) {
      const recovery = arm()
      if (connection === 'cellular' || connection === 'unknown') {
        const progress = await TrackPlayer.getProgress().catch(() => ({ position: 0 }))
        if (disposed || owner !== epoch || current()?.qid !== item.qid || revision !== getPlaybackIntent().revision) return
        if (recovery && getPlaybackIntent().requestedPosition === undefined && Number.isFinite(progress.position) && progress.position > 0) recovery.position = progress.position
        if (recovery) {
          lastProgress = { qid: item.qid, position: recovery.position }
          setNetworkPlaybackCheckpoint(lastProgress)
        }
        // Stop, rather than pause: release the remote asset so it cannot keep buffering.
        const stopKey = `${item.qid}:${revision}`
        if (stoppedFor !== stopKey) {
          await stopPlaybackForNetwork(item.qid, revision, () => !disposed && epoch === owner && !canUsePlaybackNetwork())
          if (!disposed && epoch === owner) stoppedFor = stopKey
        }
        if (getPlaybackIntent().wantsPlay) show(connection === 'cellular'
          ? '已切换到蜂窝网络；“仅 Wi-Fi 联网”已开启，在线播放已暂停'
          : '暂时无法确认网络类型，在线播放已暂停')
      } else if (recovery) {
        show('网络已断开，连接恢复后将尝试续播')
      }
      return
    }
    stoppedFor = undefined
    if (changed && connection === 'cellular' && getPlaybackIntent().wantsPlay) show('已切换到蜂窝网络，继续播放将使用移动流量')
    if (pending) schedule()
  }
  const onNetworkChange = () => {
    const connection = getPlaybackConnection()
    const changed = connection !== lastConnection
    if (changed) {
      lastConnection = connection
      epoch += 1
      clearTimer()
      lastNotice = ''
    }
    if (!canUsePlaybackNetwork()) { clearStallTimer(); suspendPlaybackNetworkWork() }
    void inspectNetwork(changed).catch((error: unknown) => console.warn('处理播放网络变化失败', error))
  }
  const failure = async (error: NormalizedPlaybackError) => {
    if (!isNetworkFailure(error) && canUsePlaybackNetwork()) return false
    const item = current()
    const revision = getPlaybackIntent().revision
    const native = await TrackPlayer.getActiveTrack().catch(() => undefined)
    if (disposed || !item || current()?.qid !== item.qid || revision !== getPlaybackIntent().revision
      || native?.id !== item.qid || typeof native.url !== 'string' || !/^https?:/i.test(native.url)) return false
    arm(canUsePlaybackNetwork())
    show(canUsePlaybackNetwork() ? '网络异常，正在尝试恢复播放'
      : getPlaybackConnection() === 'cellular' ? '“仅 Wi-Fi 联网”已开启，蜂窝网络下已暂停在线播放' : '网络不可用，连接恢复后将尝试续播')
    schedule()
    return true
  }
  receiveFailure = failure

  const networkSub = Network.addNetworkStateListener((state) => {
    updatePlaybackConnection(state)
    onNetworkChange()
  })
  const stateSub = TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    const stalled = state === State.Buffering || state === State.Loading
    if (!stalled) clearStallTimer()
    // Wi-Fi can stay connected while the server/link stalls without emitting an error.
    if (stalled && !pending && getPlaybackIntent().wantsPlay) {
      const revision = getPlaybackIntent().revision
      const qid = current()?.qid
      const identity = `${qid}:${revision}`
      if (stallTimer !== undefined && stallIdentity === identity) return
      clearStallTimer()
      stallIdentity = identity
      stallTimer = setTimeout(() => {
        stallTimer = undefined
        if (disposed || interrupted || pending || !canUsePlaybackNetwork() || !qid || current()?.qid !== qid || getPlaybackIntent().revision !== revision) return
        void Promise.all([TrackPlayer.getActiveTrack(), TrackPlayer.getPlaybackState()]).then(([native, latest]) => {
          if (disposed || interrupted || pending || !canUsePlaybackNetwork() || getPlaybackIntent().revision !== revision || current()?.qid !== qid || native?.id !== qid
            || typeof native.url !== 'string' || !/^https?:/i.test(native.url)
            || (latest.state !== State.Buffering && latest.state !== State.Loading)) return
          arm(true); show('播放缓冲时间较长，正在尝试恢复'); schedule()
        }).catch((error: unknown) => console.warn('检查播放缓冲状态失败', error))
      }, ATTEMPT_TIMEOUT_MS)
    }
    if (state !== State.Playing || !pending || !canUsePlaybackNetwork()) return
    const recovery = pending
    const owner = epoch
    void Promise.all([TrackPlayer.getActiveTrack(), TrackPlayer.getPlaybackState()]).then(([native, latest]) => {
      if (owner !== epoch || pending !== recovery || !owns(recovery) || !canUsePlaybackNetwork()
        || native?.id !== recovery.qid || latest.state !== State.Playing) return
      if (getPlaybackIntent().networkCheckpoint?.qid === recovery.qid) setNetworkPlaybackCheckpoint(undefined)
      pending = undefined; setWaitingForNetwork(false); clearTimer(); lastNotice = ''
    }).catch((error: unknown) => console.warn('确认网络续播状态失败', error))
  })
  const activeSub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    stoppedFor = undefined
    // The bridge commits the new occurrence during the same native event dispatch.
    void Promise.resolve().then(() => { if (!disposed) onNetworkChange() })
  })
  const progressSub = TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position }) => {
    const item = current()
    if (!item || !Number.isFinite(position) || getPlaybackIntent().requestedPosition !== undefined) return
    if (position === 0 && ((pending?.qid === item.qid && pending.position > 0) || getPlaybackIntent().networkCheckpoint?.qid === item.qid)) return
    lastProgress = { qid: item.qid, position }
    if (pending?.qid === item.qid) pending.position = position
  })
  const duckSub = TrackPlayer.addEventListener(Event.RemoteDuck, ({ paused, permanent }) => {
    interrupted = paused
    epoch += 1
    clearTimer()
    if (permanent) setPlaybackIntent(false)
    else if (!paused) schedule()
  })
  const unsubscribeIntent = subscribePlaybackIntent(() => {
    cancel()
    const intent = getPlaybackIntent()
    const item = current()
    if (item && intent.requestedPosition !== undefined) {
      lastProgress = { qid: item.qid, position: intent.requestedPosition }
      if (intent.networkCheckpoint?.qid === item.qid) setNetworkPlaybackCheckpoint(lastProgress)
    }
    if (intent.wantsPlay) onNetworkChange()
  })
  const unsubscribePreference = usePlaybackNetworkPreferences.subscribe((state) => {
    if (state.allowCellularPlayback === lastAllowCellular) return
    lastAllowCellular = state.allowCellularPlayback
    epoch += 1
    clearTimer()
    // Native AVURLAsset permission is updated too; JS pause alone cannot stop buffering.
    onNetworkChange()
    void applyPlaybackNetworkOptions().then(onNetworkChange).catch((error: unknown) => console.warn('更新蜂窝播放策略失败', error))
  })
  const appSub = AppState.addEventListener('change', (state) => {
    if (state !== 'active' || disposed) return
    if (deferredNotice) { notify(deferredNotice); deferredNotice = undefined }
    void refreshPlaybackConnection().then(onNetworkChange)
  })
  void refreshPlaybackConnection().then(() => { if (!disposed) onNetworkChange() })
  return () => {
    disposed = true
    cancel()
    if (receiveFailure === failure) receiveFailure = undefined
    networkSub.remove(); stateSub.remove(); activeSub.remove(); progressSub.remove(); duckSub.remove(); appSub.remove()
    unsubscribeIntent(); unsubscribePreference()
  }
}
