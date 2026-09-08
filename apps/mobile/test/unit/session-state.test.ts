import { describe, expect, it } from 'vitest'
import { sessionAfterBootstrapFailure, SIGNED_OUT_SESSION, teardownSession } from '../../src/lib/session-state'

describe('会话启动状态机', () => {
  it('初始化异常进入可恢复的退出状态，而不是永久 loading', () => {
    expect(sessionAfterBootstrapFailure()).toEqual(SIGNED_OUT_SESSION)
    expect(sessionAfterBootstrapFailure().status).toBe('signedOut')
  })

  it('登出按播放域、查询域、凭证、退出态的顺序完成', async () => {
    const steps: string[] = []
    await teardownSession({
      clearPlayback: async () => {
        steps.push('clear-playback')
      },
      clearQueryCache: () => {
        steps.push('clear-query-cache')
      },
      clearCredentials: async () => {
        steps.push('clear-credentials')
      },
      publishSignedOut: () => {
        steps.push('publish-signed-out')
      },
    })

    expect(steps).toEqual(['clear-playback', 'clear-query-cache', 'clear-credentials', 'publish-signed-out'])
  })
})
