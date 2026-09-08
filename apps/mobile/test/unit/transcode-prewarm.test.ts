import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StreamRequest, StreamSession } from '@qj/core-domain'
import { clearWarmTranscode, setWarmTranscode, takeWarmTranscode } from '../../src/player/transcode-prewarm'

function stream(id: string, close: () => Promise<void>): StreamRequest {
  const session: StreamSession = {
    id,
    heartbeatIntervalMs: 60_000,
    heartbeat: async () => undefined,
    close,
  }
  return { url: `${id}.m3u8`, headers: {}, transport: 'hls', quality: 'original', session }
}

afterEach(async () => {
  await clearWarmTranscode()
})

describe('下一首转码预热', () => {
  it('切到目标曲目时取走预热流且不关闭会话', async () => {
    const close = vi.fn(async () => undefined)
    const warmed = stream('next', close)
    await setWarmTranscode('next-qid', warmed)

    expect(await takeWarmTranscode('next-qid')).toBe(warmed)
    expect(close).not.toHaveBeenCalled()
  })

  it('队列目标变化时关闭旧预热会话', async () => {
    const oldClose = vi.fn(async () => undefined)
    await setWarmTranscode('old', stream('old', oldClose))
    await setWarmTranscode('new', stream('new', async () => undefined))
    expect(oldClose).toHaveBeenCalledOnce()
  })
})
