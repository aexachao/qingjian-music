import type { StreamRequest, StreamSession } from '@qj/core-domain'

export interface WarmTranscode {
  qid: string
  stream: StreamRequest
  session: StreamSession
  timer: ReturnType<typeof setInterval>
}

let warm: WarmTranscode | null = null
let transition: Promise<void> = Promise.resolve()

async function closeWarm(current: WarmTranscode): Promise<void> {
  clearInterval(current.timer)
  await current.session.close().catch(() => undefined)
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = transition.then(operation, operation)
  transition = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/** 保持一个“下一首”转码任务热着；新的预热会替换并关闭旧任务。 */
export function setWarmTranscode(qid: string, stream: StreamRequest): Promise<void> {
  return serialize(async () => {
    if (!stream.session) return
    if (warm?.qid === qid) {
      await stream.session.close().catch(() => undefined)
      return
    }
    if (warm) await closeWarm(warm)
    const session = stream.session
    const timer = setInterval(() => {
      void session.heartbeat(0).catch(() => {
        void clearWarmTranscode(qid)
      })
    }, session.heartbeatIntervalMs)
    warm = { qid, stream, session, timer }
  })
}

/** 切到预热歌曲时原子取走资源；调用方接管 session 生命周期。 */
export function takeWarmTranscode(qid: string): Promise<StreamRequest | undefined> {
  return serialize(async () => {
    if (warm?.qid !== qid) return undefined
    const current = warm
    warm = null
    clearInterval(current.timer)
    return current.stream
  })
}

export function clearWarmTranscode(qid?: string): Promise<void> {
  return serialize(async () => {
    if (!warm || (qid && warm.qid !== qid)) return
    const current = warm
    warm = null
    await closeWarm(current)
  })
}
