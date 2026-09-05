/**
 * 哪些格式播放器能直接解、哪些必须让服务端转码。
 * iOS 的 AVPlayer 与 Android 的 ExoPlayer 都放不了 WMA/APE/DSD 这类格式，
 * 而实测这套曲库里 WMA 占了约 5%，所以转码兜底是必须的。
 */
const NATIVE_FORMATS = new Set([
  'flac',
  'wav',
  'wave',
  'mp3',
  'm4a',
  'mp4',
  'aac',
  'alac',
  'aif',
  'aiff',
  'aifc',
  'caf',
])

/**
 * 是否需要服务端转码。格式未知时先按原生播——真放不出来会触发
 * PlaybackError，再由错误分支强制转码重试。
 */
export function needsTranscode(format?: string): boolean {
  const cleaned = (format ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!cleaned) return false
  return !NATIVE_FORMATS.has(cleaned)
}
