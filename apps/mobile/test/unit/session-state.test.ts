import { describe, expect, it } from 'vitest'
import { sessionAfterBootstrapFailure, SIGNED_OUT_SESSION, teardownSession } from '../../src/lib/session-state'

describe('会话启动状态机', () => {
  it('初始化异常进入可恢复的退出状态，而不是永久 loading', () => {
    expect(sessionAfterBootstrapFailure()).toEqual(SIGNED_OUT_SESSION)
    expect(sessionAfterBootstrapFailure().status).toBe('signedOut')
  })

  it('登出先发布本地退出态，再等待清理', async () => {
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

    expect(steps).toEqual(['clear-query-cache', 'publish-signed-out', 'clear-playback', 'clear-credentials'])
  })
})

it('凭据失败不能阻止本地退出态发布', async () => {
  let signedOut = false
  await expect(teardownSession({clearPlayback:async()=>{},clearQueryCache:()=>{},clearCredentials:async()=>{throw new Error('Keychain unavailable')},publishSignedOut:()=>{signedOut=true}})).rejects.toThrow('Keychain unavailable')
  expect(signedOut).toBe(true)
})
