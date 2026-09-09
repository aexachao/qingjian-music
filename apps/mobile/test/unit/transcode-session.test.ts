import { afterEach, describe, expect, it, vi } from 'vitest'
import { MusicError, type StreamSession } from '@qj/core-domain'

vi.mock('react-native-track-player', () => ({
  default: { getProgress: vi.fn(async () => ({ position: 0 })) },
}))

import {
  replaceTranscodeSession,
  setSessionLostHandler,
  stopTranscodeSession,
} from '../../src/player/transcode-session'

function session(id: string, close: () => Promise<void>): StreamSession {
  return {
    id,
    heartbeatIntervalMs: 60_000,
    heartbeat: async () => undefined,
    close,
  }
}

afterEach(async () => {
  setSessionLostHandler(null)
  await stopTranscodeSession()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('转码会话切换', () => {
  it('会话被服务端正常回收时触发重建但不打印警告', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const lost = vi.fn()
    setSessionLostHandler(lost)
    await replaceTranscodeSession('expired', {
      ...session('expired', async () => undefined),
      heartbeatIntervalMs: 1_000,
      heartbeat: async () => {
        throw new MusicError({ code: 'notFound', message: 'playLink not found' })
      },
    })

    await vi.advanceTimersByTimeAsync(1_000)

    expect(lost).toHaveBeenCalledWith('expired')
    expect(warn).not.toHaveBeenCalled()
  })

  it('瞬时网络错误不拆会话也不告警，下个周期照常重试', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const lost = vi.fn()
    setSessionLostHandler(lost)

    let beats = 0
    await replaceTranscodeSession('alive', {
      ...session('alive', async () => undefined),
      heartbeatIntervalMs: 1_000,
      heartbeat: async () => {
        beats += 1
        if (beats === 1) throw new MusicError({ code: 'network', message: 'fetch failed' })
      },
    })

    await vi.advanceTimersByTimeAsync(1_000)
    expect(beats).toBe(1)
    expect(lost).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()

    // 会话还活着：第二个周期心跳成功，也没有被拆掉
    await vi.advanceTimersByTimeAsync(1_000)
    expect(beats).toBe(2)
    expect(lost).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('先等待旧会话关闭，再激活新会话', async () => {
    const steps: string[] = []
    let release!: () => void
    const closing = new Promise<void>((resolve) => {
      release = resolve
    })
    await replaceTranscodeSession('old', session('old', async () => {
      steps.push('old:close:start')
      await closing
      steps.push('old:close:end')
    }))

    const replacement = replaceTranscodeSession('new', session('new', async () => {
      steps.push('new:close')
    }))
    await Promise.resolve()
    expect(steps).toEqual(['old:close:start'])
    release()
    await replacement
    expect(steps).toEqual(['old:close:start', 'old:close:end'])

    await stopTranscodeSession()
    expect(steps).toEqual(['old:close:start', 'old:close:end', 'new:close'])
  })
})
