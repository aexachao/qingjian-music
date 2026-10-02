import { describe, expect, it } from 'vitest'
import { buildStorageBreakdown, type StorageSnapshot } from '../../src/lib/storage-breakdown'

const knownSnapshot: StorageSnapshot = {
  totalBytes: 1_000,
  availableBytes: 400,
  downloadsBytes: 100,
  audioCacheFiles: 2,
  audioCacheBytes: 200,
  lyricCacheFiles: 1,
  lyricCacheBytes: 50,
  artworkCacheBytes: 25,
}

describe('storage capacity breakdown', () => {
  it('allocates known app files, other used space, and available space to a 100% bar', () => {
    const result = buildStorageBreakdown(knownSnapshot)

    expect(result?.usedBytes).toBe(600)
    expect(result?.segments.map((segment) => segment.bytes)).toEqual([100, 275, 225, 400])
    expect(result?.segments.map((segment) => segment.category)).toEqual(['downloads', 'cache', 'other', 'available'])
    expect(result?.segments.reduce((sum, segment) => sum + (segment.percent ?? 0), 0)).toBeCloseTo(100)
    expect(result?.segments.every((segment) => (segment.percent ?? 0) >= 0 && (segment.percent ?? 0) <= 100)).toBe(true)
  })

  it('keeps unreadable cache categories unknown instead of showing zero', () => {
    const result = buildStorageBreakdown({
      ...knownSnapshot,
      audioCacheBytes: null,
      lyricCacheBytes: null,
      artworkCacheBytes: null,
    })

    expect(result?.segments.find((segment) => segment.category === 'cache')).toEqual({
      category: 'cache', bytes: null, percent: null,
    })
    expect(result?.segments.find((segment) => segment.category === 'other')?.bytes).toBe(500)
  })

  it('does not emit a fake minimum width for zero-sized categories', () => {
    const result = buildStorageBreakdown({ ...knownSnapshot, downloadsBytes: 0 })

    expect(result?.segments[0]).toEqual({ category: 'downloads', bytes: 0, percent: 0 })
  })

  it('returns no proportional chart when total or available space is unknown', () => {
    expect(buildStorageBreakdown({ ...knownSnapshot, totalBytes: null })).toBeNull()
    expect(buildStorageBreakdown({ ...knownSnapshot, availableBytes: null })).toBeNull()
    expect(buildStorageBreakdown({ ...knownSnapshot, totalBytes: 0 })).toBeNull()
  })

  it('bounds inconsistent point-in-time cache readings to the device capacity', () => {
    const result = buildStorageBreakdown({
      ...knownSnapshot,
      totalBytes: 100,
      availableBytes: 0,
      downloadsBytes: 1_000,
      audioCacheBytes: 1_000,
      lyricCacheBytes: 1_000,
      artworkCacheBytes: 1_000,
    })

    expect(result?.segments.reduce((sum, segment) => sum + (segment.percent ?? 0), 0)).toBeCloseTo(100)
    expect(result?.segments.every((segment) => (segment.percent ?? 0) >= 0 && (segment.percent ?? 0) <= 100)).toBe(true)
    expect(result?.segments.find((segment) => segment.category === 'other')?.percent).toBe(0)
  })
})
