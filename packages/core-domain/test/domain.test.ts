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
})
