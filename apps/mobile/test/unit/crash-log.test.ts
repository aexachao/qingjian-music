import { describe, expect, it } from 'vitest'
import {
  CRASH_LOG_CAP,
  appendCrashLog,
  formatCrashEntryText,
  formatCrashLogText,
  parseCrashLog,
  toCrashLogEntry,
  type CrashLogEntry,
} from '../../src/lib/crash-log'

function entry(over: Partial<CrashLogEntry> = {}): CrashLogEntry {
  return { message: 'boom', source: 'uncaught', at: 1_700_000_000_000, ...over }
}

describe('toCrashLogEntry', () => {
  it('带上 stack 与版本元信息，可选字段缺省则不塞空值', () => {
    const e = toCrashLogEntry(
      { message: 'x', stack: 's', source: 'render', at: 5 },
      { appVersion: '0.1.4', buildNumber: '30' },
    )
    expect(e).toEqual({ message: 'x', stack: 's', source: 'render', at: 5, appVersion: '0.1.4', buildNumber: '30' })
  })

  it('无 stack / 无 meta 时不带这些键', () => {
    const e = toCrashLogEntry({ message: 'x', source: 'uncaught', at: 5 })
    expect(e).toEqual({ message: 'x', source: 'uncaught', at: 5 })
  })
})

describe('appendCrashLog', () => {
  it('追加到末尾', () => {
    expect(appendCrashLog([entry({ at: 1 })], entry({ at: 2 })).map((e) => e.at)).toEqual([1, 2])
  })

  it('超过上限从最旧的丢', () => {
    const many = Array.from({ length: CRASH_LOG_CAP }, (_, i) => entry({ at: i }))
    const result = appendCrashLog(many, entry({ at: 999 }))
    expect(result).toHaveLength(CRASH_LOG_CAP)
    expect(result[0]!.at).toBe(1) // 最旧的 at:0 被丢
    expect(result[result.length - 1]!.at).toBe(999)
  })
})

describe('parseCrashLog', () => {
  it('空/坏数据回空数组，不抛', () => {
    expect(parseCrashLog(null)).toEqual([])
    expect(parseCrashLog('')).toEqual([])
    expect(parseCrashLog('不是 json')).toEqual([])
    expect(parseCrashLog('{"a":1}')).toEqual([]) // 不是数组
  })

  it('过滤掉缺 message/at 的脏条目', () => {
    const raw = JSON.stringify([entry({ at: 1 }), { message: 'no-at' }, { at: 3 }, entry({ at: 2 })])
    expect(parseCrashLog(raw).map((e) => e.at)).toEqual([1, 2])
  })
})

describe('formatCrashEntryText / formatCrashLogText', () => {
  it('单条含时间/类型/消息/堆栈', () => {
    const text = formatCrashEntryText(entry({ message: 'oops', stack: 'at foo\nat bar', source: 'render' }))
    expect(text).toContain('渲染期异常')
    expect(text).toContain('oops')
    expect(text).toContain('at foo')
  })

  it('空日志给占位文案', () => {
    expect(formatCrashLogText([])).toBe('（无崩溃记录）')
  })

  it('多条按最近在最上拼接', () => {
    const text = formatCrashLogText([entry({ message: 'old', at: 1 }), entry({ message: 'new', at: 2 })])
    expect(text.indexOf('new')).toBeLessThan(text.indexOf('old'))
  })
})
