/**
 * 格式化歌单/专辑总时长为可读字符串（如「45 分钟」「1 小时 12 分钟」「1 天 2 小时 30 分钟」）。
 * 毫秒数 <= 0 或无效时返回空字符串。
 */
export function formatPlaylistDuration(durationMs?: number): string {
  if (!durationMs || durationMs <= 0 || !Number.isFinite(durationMs)) {
    return ''
  }
  const totalSeconds = Math.round(durationMs / 1000)
  const totalMinutes = Math.round(totalSeconds / 60)
  if (totalMinutes <= 0) {
    return '1 分钟'
  }
  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟`
  }
  if (totalMinutes < 1440) {
    const hours = Math.floor(totalMinutes / 60)
    const remainingMinutes = totalMinutes % 60
    if (remainingMinutes === 0) {
      return `${hours} 小时`
    }
    return `${hours} 小时 ${remainingMinutes} 分钟`
  }
  const days = Math.floor(totalMinutes / 1440)
  const remMinutes = totalMinutes % 1440
  const hours = Math.floor(remMinutes / 60)
  const mins = remMinutes % 60

  if (hours > 0 && mins > 0) {
    return `${days} 天 ${hours} 小时 ${mins} 分钟`
  }
  if (hours > 0) {
    return `${days} 天 ${hours} 小时`
  }
  if (mins > 0) {
    return `${days} 天 ${mins} 分钟`
  }
  return `${days} 天`
}

/**
 * 格式化为「可播 xx 分钟 / xx 小时 xx 分钟 / xx 天 xx 小时 xx 分钟」
 */
export function formatPlayableDurationText(durationMs?: number): string {
  const formatted = formatPlaylistDuration(durationMs)
  return formatted ? `可播 ${formatted}` : ''
}

/**
 * 歌单封面回退决策：
 * 1. 优先使用歌单自身的 coverId；
 * 2. 其次使用进入页面时路由传入的 initialCoverId；
 * 3. 再次使用第一首曲目的封面（items[0]?.coverId ?? items[0]?.album?.coverId）；
 * 4. 全无时返回 undefined（走组件内默认 BrandMark 占位符）。
 */
export function resolvePlaylistCover({
  playlistCoverId,
  initialCoverId,
  firstTrackCoverId,
}: {
  playlistCoverId?: string | null
  initialCoverId?: string | null
  firstTrackCoverId?: string | null
}): string | undefined {
  return (
    (playlistCoverId && playlistCoverId.trim()) ||
    (initialCoverId && initialCoverId.trim()) ||
    (firstTrackCoverId && firstTrackCoverId.trim()) ||
    undefined
  )
}
