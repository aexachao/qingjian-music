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
