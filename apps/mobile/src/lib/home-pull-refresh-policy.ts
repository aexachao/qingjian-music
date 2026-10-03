export const HOME_PULL_REFRESH_THRESHOLD = 80

/**
 * Scroll offsets on iOS rest at `-contentInset.top`. Normalizing against that
 * baseline makes the threshold stable whether UIKit supplies a safe-area inset
 * or this screen has no inset at all.
 */
export function homePullDistance(contentOffsetY: number, contentInsetTop = 0): number {
  'worklet'
  return Math.max(0, -contentOffsetY - Math.max(0, contentInsetTop))
}

interface HomePullRefreshControllerOptions {
  onThresholdCrossed: () => void
  /** Returns false when an in-flight refresh has already claimed this release.
   * A promise resolves after a started refresh has completed. */
  onRefresh: () => boolean | Promise<boolean>
}

/**
 * The JS-side guard shared by the worklet's threshold indication and release.
 * Keeping this small controller separate makes the haptic/refresh contract
 * testable without pretending to know UIKit's private RefreshControl trigger.
 */
export function createHomePullRefreshController({
  onThresholdCrossed,
  onRefresh,
}: HomePullRefreshControllerOptions) {
  let dragging = false
  let hapticSent = false
  let refreshing = false
  let refreshRequested = false

  const crossedThreshold = () => {
    if (!dragging || refreshing || refreshRequested || hapticSent) return
    hapticSent = true
    onThresholdCrossed()
  }

  return {
    beginDrag() {
      if (refreshing || refreshRequested) return
      dragging = true
      hapticSent = false
    },
    scroll(contentOffsetY: number, contentInsetTop = 0) {
      if (homePullDistance(contentOffsetY, contentInsetTop) >= HOME_PULL_REFRESH_THRESHOLD) {
        crossedThreshold()
      }
    },
    endDrag(contentOffsetY: number, contentInsetTop = 0) {
      if (!dragging) return
      dragging = false
      if (refreshing || refreshRequested) return
      if (homePullDistance(contentOffsetY, contentInsetTop) < HOME_PULL_REFRESH_THRESHOLD) return

      refreshRequested = true
      const refresh = onRefresh()
      if (typeof refresh === 'boolean') {
        if (!refresh) refreshRequested = false
      } else {
        void refresh.then(
          () => { refreshRequested = false },
          () => { refreshRequested = false },
        )
      }
    },
    setRefreshing(nextRefreshing: boolean) {
      refreshing = nextRefreshing
      if (!nextRefreshing) refreshRequested = false
    },
  }
}

/**
 * Android's RefreshControl already chose the trigger threshold. Claim the
 * request synchronously, then give feedback immediately instead of waiting for
 * its network work to settle.
 */
export function startNativeRefresh(
  startRefresh: () => false | Promise<unknown>,
  onStarted: () => void,
): boolean {
  const completion = startRefresh()
  if (completion === false) return false
  onStarted()
  return true
}
