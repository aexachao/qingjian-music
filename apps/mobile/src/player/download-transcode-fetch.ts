import { fetchBoundedBytes, fetchBoundedText } from '@/lib/bounded-fetch'

const MAX_DOWNLOAD_SEGMENT_BYTES = 16 * 1024 * 1024
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('下载已取消'))
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error('下载已取消'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function fetchTranscodeText(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  try {
    return await fetchBoundedText(url, { headers, signal, timeoutMs: 15_000, maxBytes: MAX_PLAYLIST_BYTES })
  } catch (error) {
    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
      throw new Error(`播放列表 HTTP ${error.status}`)
    }
    throw error
  }
}

/**
 * 取一个分片的字节。
 * **404 要重试**：转码任务刚建时分片可能还没生成（越重的源越容易踩到）。
 * **410 不重试**：任务已被回收（心跳断太久），继续重试没有意义。
 */
export async function fetchTranscodeBytes(
  url: string,
  headers: Record<string, string>,
  label: string,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const attempts = 6
  let lastStatus = 0
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchBoundedBytes(url, {
        headers,
        signal,
        timeoutMs: 15_000,
        maxBytes: MAX_DOWNLOAD_SEGMENT_BYTES,
      })
    } catch (error) {
      const status = error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : undefined
      if (status === undefined) throw error
      lastStatus = status
      if (status !== 404) break
      if (attempt < attempts) await delay(1000 * attempt, signal)
    }
  }
  throw new Error(`${label} HTTP ${lastStatus}`)
}
