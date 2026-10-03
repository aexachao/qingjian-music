import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const scenario = vi.hoisted(() => ({
  handler: undefined as any,
  result: undefined as any,
  haptic: vi.fn(() => Promise.resolve()),
}))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}))
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react')
  return {
    default: { View: 'AnimatedView' },
    interpolate: (value: number) => value,
    runOnJS: (fn: unknown) => fn,
    useAnimatedScrollHandler: (handler: unknown) => {
      scenario.handler = handler
      return handler
    },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => useRef({ value }).current,
  }
})
vi.mock('expo-haptics', () => ({
  impactAsync: scenario.haptic,
  ImpactFeedbackStyle: { Light: 'light' },
}))
vi.mock('../../src/components/icon', () => ({ Icon: 'Icon', iconSize: { sm: 16 } }))
vi.mock('../../src/theme/theme-provider', () => ({
  useThemeColors: () => ({ loadingIndicator: 'neutral', bgFloatingPill: 'surface', borderSubtle: 'border' }),
}))

import { useHomePullRefresh } from '../../src/components/home-pull-refresh'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let renderer: ReactTestRenderer | undefined
const pullEvent = (y: number, insetTop = 0) => ({ contentOffset: { y }, contentInset: { top: insetTop } })

function Probe({ refreshing = false, onRefresh = () => true }: { refreshing?: boolean; onRefresh?: () => boolean | Promise<boolean> }) {
  const scrollY: any = { value: 0 }
  scenario.result = useHomePullRefresh({ enabled: true, refreshing, onRefresh, scrollY })
  return null
}

afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount() })
  renderer = undefined
  scenario.handler = undefined
  scenario.result = undefined
  scenario.haptic.mockClear()
})

describe('首页下拉刷新 worklet 接线', () => {
  it('updates pull distance through bounce rebound and gives a fast release one haptic before one refresh', async () => {
    const refresh = vi.fn(() => true)
    await act(async () => { renderer = create(<Probe onRefresh={refresh} />) })
    const context: Record<string, unknown> = {}

    await act(async () => { scenario.handler.onBeginDrag(pullEvent(0), context) })
    await act(async () => { scenario.handler.onEndDrag(pullEvent(-80), context) })
    expect(scenario.haptic).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(scenario.result.pullDistance.value).toBe(80)

    await act(async () => { scenario.handler.onScroll(pullEvent(0), context) })
    expect(scenario.result.pullDistance.value).toBe(0)
  })

  it('does not execute queued JS callbacks after unmount', async () => {
    const refresh = vi.fn(() => true)
    await act(async () => { renderer = create(<Probe onRefresh={refresh} />) })
    const handler = scenario.handler
    const context: Record<string, unknown> = {}
    await act(async () => { renderer!.unmount() })
    renderer = undefined

    handler.onBeginDrag(pullEvent(0), context)
    handler.onScroll(pullEvent(-80), context)
    handler.onEndDrag(pullEvent(-80), context)

    expect(scenario.haptic).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('releases its coalescing latch when a refresh finishes before React renders refreshing', async () => {
    const refresh = vi.fn(async () => true)
    await act(async () => { renderer = create(<Probe onRefresh={refresh} />) })

    const firstContext: Record<string, unknown> = {}
    await act(async () => {
      scenario.handler.onBeginDrag(pullEvent(0), firstContext)
      scenario.handler.onEndDrag(pullEvent(-80), firstContext)
    })
    await act(async () => {})

    const secondContext: Record<string, unknown> = {}
    await act(async () => {
      scenario.handler.onBeginDrag(pullEvent(0), secondContext)
      scenario.handler.onEndDrag(pullEvent(-80), secondContext)
    })

    expect(refresh).toHaveBeenCalledTimes(2)
    expect(scenario.haptic).toHaveBeenCalledTimes(2)
  })
})
