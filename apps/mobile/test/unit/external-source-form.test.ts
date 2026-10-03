import { describe, expect, it, vi } from 'vitest'
import { classifyConnectionResponse, ConnectionTestSequence, runConnectionTest, validateExternalSourceUrl } from '@/lib/external-source-form'

describe('external source form validation', () => {
  it('requires an absolute HTTP(S) URL with a hostname', () => {
    expect(validateExternalSourceUrl('')).toBe('请输入服务地址')
    expect(validateExternalSourceUrl('ftp://music.example.com')).toBe('请输入有效的 HTTP 或 HTTPS 地址')
    expect(validateExternalSourceUrl('https:///')).toBe('请输入有效的 HTTP 或 HTTPS 地址')
    expect(validateExternalSourceUrl(' https://music.example.com/api/ ')).toBeNull()
  })

  it('does not describe authentication failure or a 404 as provider success', () => {
    expect(classifyConnectionResponse(401)).toBe('auth-failed')
    expect(classifyConnectionResponse(403)).toBe('auth-failed')
    expect(classifyConnectionResponse(404)).toBe('reachable')
    expect(classifyConnectionResponse(400)).toBe('reachable')
    expect(classifyConnectionResponse(204)).toBe('reachable')
    expect(classifyConnectionResponse(503)).toBe('failed')
  })

  it('settles a timed out connection test as failed so loading can end', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const pending = runConnectionTest((signal) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }), controller, 8000)
      await vi.advanceTimersByTimeAsync(8000)
      await expect(pending).resolves.toEqual({ result: 'failed', timedOut: true, cancelled: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores an older response after a new input starts a test', async () => {
    const sequence = new ConnectionTestSequence()
    let result = 'testing'
    const older = sequence.begin()
    let resolveOlder!: (value: 'reachable') => void
    const olderRequest = new Promise<'reachable'>((resolve) => { resolveOlder = resolve })
    const oldCompletion = olderRequest.then((value) => {
      if (sequence.isCurrent(older.id)) result = value
    })

    const current = sequence.begin()
    let resolveCurrent!: (value: 'auth-failed') => void
    const currentRequest = new Promise<'auth-failed'>((resolve) => { resolveCurrent = resolve })
    const currentCompletion = currentRequest.then((value) => {
      if (sequence.isCurrent(current.id)) result = value
    })

    resolveOlder('reachable')
    await oldCompletion
    expect(result).toBe('testing')
    resolveCurrent('auth-failed')
    await currentCompletion
    expect(result).toBe('auth-failed')
  })
})
