import { describe, expect, it } from 'vitest'
import { lyricScrollGeometry } from '../../src/lib/lyric-scroll-geometry'

describe('lyric scroll geometry', () => {
  it.each([
    { name: 'portrait stage', viewportHeight: 540, topInset: 132, bottomInset: 178, rowHeight: 56 },
    { name: 'landscape stage', viewportHeight: 276, topInset: 48, bottomInset: 44, rowHeight: 72 },
    { name: 'long final line', viewportHeight: 540, topInset: 132, bottomInset: 178, rowHeight: 204 },
  ])('keeps the last row reachable at its readable anchor ($name)', ({ viewportHeight, topInset, bottomInset, rowHeight }) => {
    const rowTop = 2400
    const geometry = lyricScrollGeometry({ viewportHeight, rowTop, rowHeight, topInset, bottomInset, contentTopInset: 8 })
    const maximumScroll = Math.max(0, 8 + rowTop + rowHeight + geometry.tailPadding - viewportHeight)
    const rowTopAtEnd = 8 + rowTop - maximumScroll

    expect(maximumScroll).toBeCloseTo(geometry.targetScrollY, 5)
    expect(rowTopAtEnd).toBeGreaterThanOrEqual(topInset)
    expect(rowTopAtEnd + rowHeight).toBeLessThanOrEqual(viewportHeight - bottomInset)
  })

  it('keeps short lyrics readable when the stage mask leaves little space', () => {
    const viewportHeight = 480
    const topInset = 120
    const bottomInset = 300
    const rowTop = topInset
    const rowHeight = 48
    const geometry = lyricScrollGeometry({ viewportHeight, rowTop, rowHeight, topInset, bottomInset, contentTopInset: 8 })
    const maximumScroll = Math.max(0, 8 + rowTop + rowHeight + geometry.tailPadding - viewportHeight)
    const rowTopAtEnd = 8 + rowTop - maximumScroll

    expect(geometry.effectiveHeight).toBe(60)
    expect(geometry.anchorOffset).toBe(12)
    expect(maximumScroll).toBe(0)
    expect(rowTopAtEnd).toBeGreaterThanOrEqual(topInset)
    expect(rowTopAtEnd + rowHeight).toBeLessThanOrEqual(viewportHeight - bottomInset)
  })

  it('uses one bottom occlusion value without compounding toolbar and mask space', () => {
    const geometry = lyricScrollGeometry({
      viewportHeight: 540,
      rowTop: 2400,
      rowHeight: 56,
      topInset: 132,
      bottomInset: 178,
      contentTopInset: 8,
    })

    expect(geometry.effectiveHeight).toBe(230)
    expect(geometry.tailPadding).toBeCloseTo(264.6, 5)
  })
})
