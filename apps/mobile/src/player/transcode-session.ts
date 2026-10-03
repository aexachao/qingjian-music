import TrackPlayer from 'react-native-track-player'
import { isMusicError, type StreamSession } from '@qj/core-domain'
import { isWarmTranscodeCurrent } from './transcode-prewarm'

/**
 * 转码会话保活。飞牛的转码任务靠心跳判活：
 * 断掉心跳后任务会被回收，分片开始返回 410；
 * 退出时必须显式 quit，否则服务端会堆着转码进程。
 * 同一时刻只会有一个会话（只有正在播的那首需要）。
 */
interface ActiveSession {
  qid: string
  session: StreamSession
  timer: ReturnType<typeof setInterval>
  beating: boolean
}

let active: ActiveSession | null = null
let sessionLostHandler: ((qid: string) => void) | null = null
let transition: Promise<void> = Promise.resolve()

/** 心跳失败（任务已被回收）时的回调，由 PlayerBridge 注册成「重开会话」 */
export function setSessionLostHandler(handler: ((qid: string) => void) | null): void {
  sessionLostHandler = handler
}

export function hasTranscodeSession(qid: string): boolean {
  return active?.qid === qid
}

/** True while this exact session is still owned by the current or warm slot. */
export function isTranscodeSessionCurrent(qid: string, session: StreamSession): boolean {
  return (active?.qid === qid && active.session === session) || isWarmTranscodeCurrent(qid, session)
}

async function beat(): Promise<void> {
  const current = active
  if (!current || current.beating) return
  current.beating = true
  try {
    const progress = await TrackPlayer.getProgress()
    if (active !== current) return
    await current.session.heartbeat(progress.position * 1000)
  } catch (error) {
    // 只有服务端明确说「任务已被回收」（notFound）才算会话死亡，交给上层重建。
    // 网络抖动 / 超时 / 请求取消等瞬时错误：会话还活着，下个周期重试即可，
    // 既不告警也不拆会话，避免把一次掉包放大成「保活失败 + 重建失败」两条噪声日志。
    if (!isMusicError(error) || error.code !== 'notFound') return
    if (active === current) {
      clearInterval(current.timer)
      active = null
      sessionLostHandler?.(current.qid)
    }
  } finally {
    current.beating = false
  }
}

async function replaceNow(qid: string, session: StreamSession, isCurrent: () => boolean): Promise<void> {
  if (!isCurrent()) { void session.close().catch(() => undefined); return }
  if (active?.session === session) return
  // Recovering the same queue occurrence can replace its URL/session. Retire the
  // old local heartbeat instead of closing the newly created server task.
  if (active?.qid === qid) {
    clearInterval(active.timer)
    active = null
  } else {
    await stopNow()
  }
  if (!isCurrent()) { void session.close().catch(() => undefined); return }
  const timer = setInterval(() => {
    void beat()
  }, session.heartbeatIntervalMs)
  active = { qid, session, timer, beating: false }
}

export function replaceTranscodeSession(qid: string, session: StreamSession, isCurrent = () => true): Promise<void> {
  const result = transition.then(() => replaceNow(qid, session, isCurrent))
  transition = result.catch(() => undefined)
  return result
}

/** 注册并开始保活；兼容无需等待的调用方 */
export function startTranscodeSession(qid: string, session: StreamSession, isCurrent = () => true): void {
  void replaceTranscodeSession(qid, session, isCurrent).catch(() => undefined)
}

/** 关闭当前会话（传 qid 时只关这一个）；quit 失败只记日志 */
async function stopNow(qid?: string): Promise<void> {
  const current = active
  if (!current) return
  if (qid && current.qid !== qid) return
  clearInterval(current.timer)
  active = null
  // Detach locally before requesting remote cleanup; a slow quit must not block the next song.
  void current.session.close().catch((error: unknown) => {
    console.warn('转码会话退出失败', error)
  })
}

export function stopTranscodeSession(qid?: string, isCurrent = () => true): Promise<void> {
  const result = transition.then(() => isCurrent() ? stopNow(qid) : undefined)
  transition = result.catch(() => undefined)
  return result
}
