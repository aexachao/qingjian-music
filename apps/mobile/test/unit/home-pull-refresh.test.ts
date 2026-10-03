import { describe, expect, it, vi } from 'vitest'
import {
  HOME_PULL_REFRESH_THRESHOLD,
  createHomePullRefreshController,
  homePullDistance,
  startNativeRefresh,
} from '../../src/lib/home-pull-refresh-policy'

describe('首页 iOS 下拉刷新阈值', () => {
  it('normalizes pull distance against the native content inset', () => {
    expect(homePullDistance(-44, 44)).toBe(0)
    expect(homePullDistance(-123, 44)).toBe(79)
    expect(homePullDistance(-124, 44)).toBe(HOME_PULL_REFRESH_THRESHOLD)
  })

  it('does not haptic for a cold pull below the threshold', () => {
    const haptic = vi.fn()
    const refresh = vi.fn(() => true)
    const controller = createHomePullRefreshController({ onThresholdCrossed: haptic, onRefresh: refresh })

    controller.beginDrag()
    controller.scroll(-79)
    controller.endDrag(-79)

    expect(haptic).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('haptics exactly once when a drag crosses and re-crosses the threshold', () => {
    const haptic = vi.fn()
    const controller = createHomePullRefreshController({ onThresholdCrossed: haptic, onRefresh: () => true })

    controller.beginDrag()
    controller.scroll(-80)
    controller.scroll(-20)
    controller.scroll(-80)

    expect(haptic).toHaveBeenCalledOnce()
  })

  it('cancels a crossed pull released below the threshold', () => {
    const refresh = vi.fn(() => true)
    const controller = createHomePullRefreshController({ onThresholdCrossed: vi.fn(), onRefresh: refresh })

    controller.beginDrag()
    controller.scroll(-80)
    controller.endDrag(-79)

    expect(refresh).not.toHaveBeenCalled()
  })

  it('starts one refresh on release and suppresses haptics and releases while refreshing', () => {
    const haptic = vi.fn()
    const refresh = vi.fn(() => true)
    const controller = createHomePullRefreshController({ onThresholdCrossed: haptic, onRefresh: refresh })

    controller.beginDrag()
    controller.scroll(-80)
    controller.endDrag(-80)
    controller.setRefreshing(true)
    controller.beginDrag()
    controller.scroll(-80)
    controller.endDrag(-80)

    expect(refresh).toHaveBeenCalledOnce()
    expect(haptic).toHaveBeenCalledOnce()
  })

  it('ignores momentum/programmatic scrolling because no drag began', () => {
    const haptic = vi.fn()
    const refresh = vi.fn(() => true)
    const controller = createHomePullRefreshController({ onThresholdCrossed: haptic, onRefresh: refresh })

    controller.scroll(-120)
    controller.endDrag(-120)

    expect(haptic).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('gives Android feedback when its native callback claims refresh, before deferred work settles', async () => {
    let complete!: () => void
    const pending = new Promise<true>((resolve) => { complete = () => resolve(true) })
    const haptic = vi.fn()

    expect(startNativeRefresh(() => pending, haptic)).toBe(true)
    expect(haptic).toHaveBeenCalledOnce()
    complete()
    await pending
    expect(haptic).toHaveBeenCalledOnce()
  })
})
