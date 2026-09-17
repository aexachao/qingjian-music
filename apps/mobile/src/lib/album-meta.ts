import type { Track } from '@qj/core-domain'

const LOSSLESS_FORMATS = new Set([
  'flac',
  'alac',
  'wav',
  'ape',
  'dsd',
  'dsf',
  'dff',
  'aiff',
])

/**
 * 根据专辑内的音轨音频规格，智能提取发烧级音质徽章：
 * - 包含 24bit 或 >= 88.2kHz 采样率：'Hi-Res'
 * - 属于常规无损编码（FLAC、ALAC、WAV 等）：'无损'
 * - 其余或未识别：undefined
 */
export function getAlbumAudioSpecBadge(tracks: readonly Track[]): 'Hi-Res' | '无损' | undefined {
  if (!tracks || tracks.length === 0) return undefined

  let hasLossless = false

  for (const track of tracks) {
    const audio = track.audio
    if (!audio) continue

    // 1. 优先判定 Hi-Res 规格（24bit 或 >= 88.2kHz）
    if ((audio.bitDepth && audio.bitDepth >= 24) || (audio.sampleRateHz && audio.sampleRateHz >= 88200)) {
      return 'Hi-Res'
    }

    // 2. 检查是否为无损编码
    const raw = audio.format || audio.container || audio.codec
    if (raw) {
      const normalized = raw.toLowerCase().trim().replace(/^\./, '')
      if (LOSSLESS_FORMATS.has(normalized)) {
        hasLossless = true
      }
    }
  }

  return hasLossless ? '无损' : undefined
}

/**
 * 从发行日期中提取格式化年份（如「2022 年」）
 */
export function formatAlbumYear(releaseDate?: string): string | undefined {
  if (!releaseDate || typeof releaseDate !== 'string') return undefined
  const year = releaseDate.slice(0, 4).trim()
  if (/^\d{4}$/.test(year)) {
    return `${year} 年`
  }
  return undefined
}
