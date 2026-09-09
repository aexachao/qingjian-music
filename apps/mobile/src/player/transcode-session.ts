import TrackPlayer from 'react-native-track-player'
import { isMusicError, type StreamSession } from '@qj/core-domain'

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

async function beat(): Promise<void> {
  const current = active
  if (!current) return
  try {
    const progress = await TrackPlayer.getProgress()
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
  }
}

async function replaceNow(qid: string, session: StreamSession): Promise<void> {
  if (active?.qid === qid) {
    await session.close().catch((error: unknown) => {
      console.warn('重复转码会话退出失败', error)
    })
    return
  }
  await stopNow()
  const timer = setInterval(() => {
    void beat()
  }, session.heartbeatIntervalMs)
  active = { qid, session, timer }
}

export function replaceTranscodeSession(qid: string, session: StreamSession): Promise<void> {
  const result = transition.then(() => replaceNow(qid, session))
  transition = result.catch(() => undefined)
  return result
}

/** 注册并开始保活；兼容无需等待的调用方 */
export function startTranscodeSession(qid: string, session: StreamSession): void {
  void replaceTranscodeSession(qid, session)
}

/** 关闭当前会话（传 qid 时只关这一个）；quit 失败只记日志 */
async function stopNow(qid?: string): Promise<void> {
  const current = active
  if (!current) return
  if (qid && current.qid !== qid) return
  clearInterval(current.timer)
  active = null
  try {
    await current.session.close()
  } catch (error) {
    console.warn('转码会话退出失败', error)
  }
}

export function stopTranscodeSession(qid?: string): Promise<void> {
  const result = transition.then(() => stopNow(qid))
  transition = result.catch(() => undefined)
  return result
}
