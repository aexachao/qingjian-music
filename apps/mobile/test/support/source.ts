import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 架构契约测试专用的源码读取工具。
 *
 * 背景：这类测试断言的是「某个写法在不在源码里」，用 `readFileSync` 直接读原文会导致
 * 两类假失败 ——
 *   1. 只是重新排版 / 换行位置变了，断言就挂（例如断言里带 `\n      `）；
 *   2. 注释里提到某个被禁用的写法（「不要用 withSequence」）也会命中 `not.toContain`。
 *
 * 所以默认读取走 `readSource()`：**去掉注释 + 把连续空白折成一个空格**。
 * 断言写「代码里有没有这个写法」，而不是「排版长什么样」。
 *
 * 仍然需要原文（例如要断言某段说明注释存在）时用 `readRawSource()`。
 */

const SRC_ROOT = resolve(__dirname, '../../src')

export function readRawSource(relativePath: string): string {
  return readFileSync(resolve(SRC_ROOT, relativePath), 'utf8')
}

/** 去掉行注释与块注释。字符串里出现 `://` 的情况已排除，避免误伤 URL。 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
}

export function collapseWhitespace(source: string): string {
  return source.replace(/\s+/g, ' ')
}

/**
 * 默认读取：去注释 + 折叠空白。
 * 断言里不要写换行与缩进（例如写 `if (mode === 'list') { setIsListAtTop(true)`，
 * 不要写 `if (mode === 'list') {\n      setIsListAtTop(true)`）。
 */
export function readSource(relativePath: string): string {
  return collapseWhitespace(stripComments(readRawSource(relativePath)))
}

/** 源码（归一化后）里是否出现了这段代码 */
export function hasCode(relativePath: string, snippet: string): boolean {
  return readSource(relativePath).includes(snippet)
}

/** 源码（归一化后）里是否已经不再出现这段代码 */
export function hasNoCode(relativePath: string, snippet: string): boolean {
  return !readSource(relativePath).includes(snippet)
}

/** 批量读取，键是短名、值是相对 src/ 的路径 */
export function readSources<T extends Record<string, string>>(map: T): Record<keyof T, string> {
  const out = {} as Record<keyof T, string>
  for (const key of Object.keys(map) as (keyof T)[]) {
    out[key] = readSource(map[key])
  }
  return out
}
