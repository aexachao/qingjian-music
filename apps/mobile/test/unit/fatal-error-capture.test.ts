import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetFatalErrorForTest,
  clearFatalError,
  formatFatalError,
  getFatalError,
  installGlobalErrorHandler,
  reportFatalError,
  STACK_LINE_LIMIT,
  subscribeFatalError,
  trimStack,
} from '../../src/lib/fatal-error-capture'

beforeEach(() => {
  __resetFatalErrorForTest()
})

describe('致命错误归一化', () => {
  it('Error 取 message 与 stack', () => {
    const info = formatFatalError(new Error('模块未找到'), 'uncaught', 123)
    expect(info.message).toBe('模块未找到')
    expect(info.stack).toContain('Error')
    expect(info.source).toBe('uncaught')
    expect(info.at).toBe(123)
  })

  it('message 为空串时退回 Error.name，而不是显示一片空白', () => {
    const e = new Error()
    e.name = 'TypeError'
    expect(formatFatalError(e, 'render', 0).message).toBe('TypeError')
  })

  it('字符串直接作为消息', () => {
    expect(formatFatalError('炸了', 'uncaught', 0).message).toBe('炸了')
  })

  it('普通对象走 JSON', () => {
    expect(formatFatalError({ code: 500 }, 'uncaught', 0).message).toBe('{"code":500}')
  })

  it('循环引用不抛错，退回 String()', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => formatFatalError(cyclic, 'uncaught', 0)).not.toThrow()
    expect(formatFatalError(cyclic, 'uncaught', 0).message).toContain('[object')
  })

  it('undefined / null 也能给出可读结果', () => {
    expect(formatFatalError(undefined, 'uncaught', 0).message).toBe('undefined')
    expect(formatFatalError(null, 'uncaught', 0).message).toBe('null')
  })
})

describe('堆栈截断', () => {
  it('去掉空行与缩进，并截到上限', () => {
    const raw = ['Error: x', '  at a (a.ts:1)', '', '   at b (b.ts:2)'].join('\n')
    expect(trimStack(raw)).toEqual(['Error: x', 'at a (a.ts:1)', 'at b (b.ts:2)'])
  })

  it('超长堆栈按上限截断 —— 手机上放不下整屏', () => {
    const raw = Array.from({ length: 100 }, (_, i) => `at frame${i}`).join('\n')
    expect(trimStack(raw)).toHaveLength(STACK_LINE_LIMIT)
  })

  it('没有堆栈时返回空数组而不是 [undefined]', () => {
    expect(trimStack(undefined)).toEqual([])
    expect(trimStack('')).toEqual([])
  })
})

describe('错误状态与订阅', () => {
  it('初始为空', () => {
    expect(getFatalError()).toBeNull()
  })

  it('记录后订阅者能收到', () => {
    const seen: unknown[] = []
    subscribeFatalError((info) => seen.push(info?.message ?? null))
    reportFatalError(new Error('第一个'), 'uncaught', 1)
    expect(seen).toEqual(['第一个'])
  })

  it('第一个错误胜出 —— 后续错误通常是它的连锁反应，覆盖会把真正的根因冲掉', () => {
    reportFatalError(new Error('根因'), 'uncaught', 1)
    reportFatalError(new Error('连锁反应'), 'render', 2)
    expect(getFatalError()?.message).toBe('根因')
  })

  it('取消订阅后不再收到通知', () => {
    const fn = vi.fn()
    const off = subscribeFatalError(fn)
    off()
    reportFatalError(new Error('x'), 'uncaught', 1)
    expect(fn).not.toHaveBeenCalled()
  })

  it('清除后回到空状态并通知订阅者', () => {
    reportFatalError(new Error('x'), 'uncaught', 1)
    const fn = vi.fn()
    subscribeFatalError(fn)
    clearFatalError()
    expect(getFatalError()).toBeNull()
    expect(fn).toHaveBeenCalledWith(null)
  })

  it('清除之后可以记录新的错误（重试路径）', () => {
    reportFatalError(new Error('旧的'), 'uncaught', 1)
    clearFatalError()
    reportFatalError(new Error('新的'), 'render', 2)
    expect(getFatalError()?.message).toBe('新的')
  })
})

describe('全局异常处理器', () => {
  it('装得上并捕获未捕获异常', () => {
    let handler: ((e: unknown, fatal?: boolean) => void) | undefined
    const utils = { setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => { handler = h } }
    vi.stubGlobal('ErrorUtils', utils)

    expect(installGlobalErrorHandler(() => 42)).toBe(true)
    handler?.(new Error('未捕获'))
    expect(getFatalError()).toEqual({ message: '未捕获', stack: expect.any(String), source: 'uncaught', at: 42 })

    vi.unstubAllGlobals()
  })

  it('拿不到 ErrorUtils 时返回 false 而不是抛错 —— RN 之外的运行环境不该因此崩掉', () => {
    vi.stubGlobal('ErrorUtils', undefined)
    expect(installGlobalErrorHandler()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('不转发给上一个处理器 —— 转发意味着 release 下进程被终止，错误就永远显示不出来', () => {
    const previous = vi.fn()
    vi.stubGlobal('ErrorUtils', {
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => {
        // 这里拿到的必须是我们的处理器，而不是包装了 previous 的
        h(new Error('x'))
      },
    })
    installGlobalErrorHandler()
    expect(previous).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
