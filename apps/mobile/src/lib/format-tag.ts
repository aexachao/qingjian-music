import type { Track } from '@qj/core-domain'

/**
 * 从曲目的音频规格中提取短音频格式标识（如 FLAC、MP3、WAV、DSD 等）
 */
export function getTrackFormatTag(track: Track): string | undefined {
  const raw =
    track.audio?.format ||
    track.audio?.container ||
    track.audio?.codec ||
    (track.audio?.path ? track.audio.path.split('.').pop() : undefined)

  if (!raw) return undefined
  const cleaned = raw.toLowerCase().trim().replace(/^\./, '')
  if (!cleaned || cleaned.length > 5) return undefined
  return cleaned.toUpperCase()
}
