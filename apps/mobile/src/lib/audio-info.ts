import type { QueueItem } from '@qj/core-domain'
import { needsTranscode } from '../player/format-support'

/**
 * 判断队列元素是否属于服务端转码
 */
export function isItemTranscoded(item: QueueItem): boolean {
  return needsTranscode(item.format)
}

/**
 * 格式化音源规格信息，格式规范：
 * 「原文件 · FLAC · 716 kbps」或「服务端解码 · WMA · 960 kbps」
 */
export function formatAudioSourceInfo(item: QueueItem): string {
  // 1. 解码模式：服务端解码 vs 原文件
  const mode = isItemTranscoded(item) ? '服务端解码' : '原文件'

  // 2. 格式：大写（如 FLAC, MP3, WAV, DSF 等）
  const rawFormat = item.format || 'flac'
  const format = rawFormat.toUpperCase().trim().replace(/^\./, '')

  // 3. 码率（kbps）
  let bitrateStr: string | undefined
  if (item.bitrateBps && item.bitrateBps > 0) {
    const kbps = item.bitrateBps > 5000 ? Math.round(item.bitrateBps / 1000) : Math.round(item.bitrateBps)
    bitrateStr = `${kbps} kbps`
  } else if (item.sizeBytes && item.durationMs > 0) {
    const kbps = Math.round((item.sizeBytes * 8) / (item.durationMs / 1000) / 1000)
    if (kbps > 0) {
      bitrateStr = `${kbps} kbps`
    }
  }

  // 组合成「原文件 · FLAC · 716 kbps」
  const parts = [mode, format, bitrateStr].filter(Boolean)
  return parts.join(' · ')
}
