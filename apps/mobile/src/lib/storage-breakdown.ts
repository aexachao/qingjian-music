export interface StorageSnapshot {
  totalBytes: number | null
  availableBytes: number | null
  downloadsBytes: number | null
  audioCacheFiles: number | null
  audioCacheBytes: number | null
  lyricCacheFiles: number | null
  lyricCacheBytes: number | null
  artworkCacheBytes: number | null
}

export type StorageCategory = 'downloads' | 'cache' | 'other' | 'available'

export interface StorageSegment {
  category: StorageCategory
  bytes: number | null
  /** Proportional width in the bar. Null means its size could not be measured. */
  percent: number | null
}

export interface StorageBreakdown {
  totalBytes: number
  availableBytes: number
  usedBytes: number
  segments: StorageSegment[]
}

function validBytes(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0
}

/** Build a bounded 100% capacity bar; unknown categories are never presented as zero. */
export function buildStorageBreakdown(snapshot: StorageSnapshot): StorageBreakdown | null {
  if (!validBytes(snapshot.totalBytes) || snapshot.totalBytes <= 0 || !validBytes(snapshot.availableBytes)) return null

  const totalBytes = snapshot.totalBytes
  const availableBytes = Math.min(totalBytes, snapshot.availableBytes)
  const usedBytes = totalBytes - availableBytes

  const hasKnownCache = validBytes(snapshot.audioCacheBytes) || validBytes(snapshot.lyricCacheBytes) || validBytes(snapshot.artworkCacheBytes)
  const cacheBytes = hasKnownCache
    ? (validBytes(snapshot.audioCacheBytes) ? snapshot.audioCacheBytes : 0) +
      (validBytes(snapshot.lyricCacheBytes) ? snapshot.lyricCacheBytes : 0) +
      (validBytes(snapshot.artworkCacheBytes) ? snapshot.artworkCacheBytes : 0)
    : null

  const measured: [StorageCategory, number | null][] = [
    ['downloads', snapshot.downloadsBytes],
    ['cache', cacheBytes],
  ]
  const knownTotal = measured.reduce((sum, [, bytes]) => sum + (validBytes(bytes) ? bytes : 0), 0)
  const scale = knownTotal > usedBytes && knownTotal > 0 ? usedBytes / knownTotal : 1
  let allocatedBytes = 0
  const segments: StorageSegment[] = measured.map(([category, bytes]) => {
    if (!validBytes(bytes)) return { category, bytes: null, percent: null }
    const barBytes = bytes * scale
    allocatedBytes += barBytes
    return { category, bytes, percent: (barBytes / totalBytes) * 100 }
  })

  const otherBytes = Math.max(0, usedBytes - allocatedBytes)
  segments.push(
    { category: 'other', bytes: otherBytes, percent: (otherBytes / totalBytes) * 100 },
    { category: 'available', bytes: availableBytes, percent: (availableBytes / totalBytes) * 100 },
  )

  // Avoid a floating-point overshoot that could make React Native lay out beyond 100%.
  let remainingPercent = 100
  for (const segment of segments) {
    if (segment.percent === null) continue
    segment.percent = Math.max(0, Math.min(remainingPercent, segment.percent))
    remainingPercent -= segment.percent
  }

  return { totalBytes, availableBytes, usedBytes, segments }
}
