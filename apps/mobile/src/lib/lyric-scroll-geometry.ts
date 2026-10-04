export interface LyricScrollGeometryInput {
  viewportHeight: number
  rowTop: number
  rowHeight: number
  topInset: number
  bottomInset: number
  contentTopInset?: number
}

export interface LyricScrollGeometry {
  effectiveHeight: number
  anchorOffset: number
  targetScrollY: number
  tailPadding: number
}

/**
 * Keep the follow anchor and the end-of-content padding in the same geometry.
 * The padding is the minimum needed for the last row to reach the follow anchor;
 * it does not add the toolbar and mask insets together because they describe the
 * same obscured area in immersive player layouts.
 */
export function lyricScrollGeometry({
  viewportHeight,
  rowTop,
  rowHeight,
  topInset,
  bottomInset,
  contentTopInset = 0,
}: LyricScrollGeometryInput): LyricScrollGeometry {
  const viewport = Math.max(0, viewportHeight)
  const top = Math.max(0, topInset)
  const bottom = Math.max(0, bottomInset)
  const row = Math.max(0, rowHeight)
  const effectiveHeight = Math.max(0, viewport - top - bottom)
  // A tall final line cannot fit at the normal anchor; pin its start to the
  // visible top edge so the beginning remains readable.
  const anchorOffset = Math.min(effectiveHeight * 0.38, Math.max(0, effectiveHeight - row))
  const targetScrollY = Math.max(rowTop + Math.max(0, contentTopInset) - top - anchorOffset, 0)
  const tailPadding = Math.max(0, viewport - top - anchorOffset - row)

  return { effectiveHeight, anchorOffset, targetScrollY, tailPadding }
}
