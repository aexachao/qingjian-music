import { describe, expect, it } from 'vitest'
import { makePage, nextPageNumber, parseQualifiedId, qualifyId, MusicError, toMusicError } from '../src/index'

describe('QualifiedId', () => {
  it('拼接与解析可逆', () => {
    const qid = qualifyId('srv1', 'c9ff3ff3f9d14262a1d11f884356b263')
    expect(qid).toBe('srv1:c9ff3ff3f9d14262a1d11f884356b263')
    expect(parseQualifiedId(qid)).toEqual({ serverId: 'srv1', entityId: 'c9ff3ff3f9d14262a1d11f884356b263' })
  })

  it('serverId 内含分隔符时报错', () => {
    expect(() => qualifyId('a:b', 'x')).toThrow()
  })

  it('解析非法值时报错', () => {
    expect(() => parseQualifiedId('nocolon')).toThrow()
    expect(() => parseQualifiedId(':x')).toThrow()
    expect(() => parseQualifiedId('x:')).toThrow()
  })
})

describe('分页', () => {
  it('满页且未到总数时 hasMore 为真', () => {
    const page = makePage([1, 2, 3], 10, { page: 1, size: 3 })
    expect(page.hasMore).toBe(true)
    expect(nextPageNumber(page)).toBe(2)
  })

  it('不满页时 hasMore 为假', () => {
    const page = makePage([1, 2], 10, { page: 1, size: 3 })
    expect(page.hasMore).toBe(false)
    expect(nextPageNumber(page)).toBeUndefined()
  })

  it('最后一页刚好满时 hasMore 为假', () => {
    const page = makePage([1, 2, 3], 6, { page: 2, size: 3 })
    expect(page.hasMore).toBe(false)
  })
})

describe('MusicError', () => {
  it('网络类错误可重试，鉴权错误要求重新登录', () => {
    expect(new MusicError({ code: 'timeout', message: '超时' }).retryable).toBe(true)
    expect(new MusicError({ code: 'unauthorized', message: '未登录' }).needsReauth).toBe(true)
    expect(new MusicError({ code: 'forbidden', message: '无权限' }).retryable).toBe(false)
  })

  it('AbortError 归类为 canceled', () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(toMusicError(abort).code).toBe('canceled')
  })

  it('expo fetch 的取消异常也归类为 canceled，而不是 network', () => {
    // 回归防线：expo 的原生 fetch 被取消时抛的是它自己的异常，
    // 名字既不是 AbortError 也不在 name 里，只出现在 message 里。
    // 认不出来就会变成 code:'network'（可重试）—— 既掩盖真实原因，又会重试一个已放弃的请求。
    const canceled = new Error('fetch failed: FetchRequestCanceledException: Fetch request has been canceled')
    expect(toMusicError(canceled).code).toBe('canceled')
    expect(toMusicError(canceled).retryable).toBe(false)
  })

  it('普通网络错误仍然是 network 且可重试', () => {
    expect(toMusicError(new Error('Network request failed')).code).toBe('network')
    expect(toMusicError(new Error('Network request failed')).retryable).toBe(true)
  })
})
