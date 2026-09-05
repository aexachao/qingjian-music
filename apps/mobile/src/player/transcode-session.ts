import TrackPlayer from 'react-native-track-player'
import type { StreamSession } from '@qj/core-domain'

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
    console.warn('转码会话保活失败', error)
    // 任务没了就别继续敲了，交给上层重新起一个
    if (active === current) {
      clearInterval(current.timer)
      active = null
      sessionLostHandler?.(current.qid)
    }
  }
}

/** 注册并开始保活；换曲目时会先把上一个会话关掉 */
export function startTranscodeSession(qid: string, session: StreamSession): void {
  if (active?.qid === qid) return
  void stopTranscodeSession()
  const timer = setInterval(() => {
    void beat()
  }, session.heartbeatIntervalMs)
  active = { qid, session, timer }
}

/** 关闭当前会话（传 qid 时只关这一个）；quit 失败只记日志 */
export async function stopTranscodeSession(qid?: string): Promise<void> {
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
