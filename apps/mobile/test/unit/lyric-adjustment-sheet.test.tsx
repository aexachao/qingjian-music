import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => motion.reduced }))

vi.mock('react-native', () => ({
  Modal: 'Modal', Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { absoluteFill: {}, hairlineWidth: 1 },
}))
vi.mock('react-native-svg', () => ({
  default: 'Svg', Svg: 'Svg', Path: 'Path',
}))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }))
vi.mock('../../src/lib/lyric-offset', () => ({
  OFFSET_STEP_MS: 100,
  formatProgressStatus: (value: number) => value === 0 ? '歌词进度 正常' : `歌词进度 ${value > 0 ? '提前' : '延后'} ${(Math.abs(value) / 1000).toFixed(1)} 秒`,
  formatOffset: (value: number) => `${value}ms`,
}))
vi.mock('../../src/lib/haptics', () => ({ tap: vi.fn() }))
vi.mock('../../src/theme/theme-provider', () => ({
  useThemeColors: () => ({ textPrimary: 'white' }),
  createThemedStyles: (factory: (colors: Record<string, string>) => unknown) => () => factory({}),
}))

import { LyricAdjustmentSheet } from '../../src/components/player/lyric-adjustment-sheet'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('adjusts lyrics by exactly 0.1 second in the selected direction', async () => {
  const adjust = vi.fn()
  let renderer: ReactTestRenderer | undefined
  await act(async () => {
    renderer = create(<LyricAdjustmentSheet visible offsetMs={0} onAdjust={adjust} onClose={vi.fn()} />)
  })
  const buttons = renderer!.root.findAllByType('Pressable' as never)
  // buttons[0] 是全屏透明背景，[1] 是延后 0.1秒，[2] 是重置，[3] 是提前 0.1秒
  await act(async () => { buttons[1]?.props.onPress() })
  await act(async () => { buttons[3]?.props.onPress() })
  expect(adjust.mock.calls).toEqual([[-100], [100]])
  await act(async () => { renderer!.unmount() })
})

it('opens the adjustment sheet without sliding when Reduce Motion is enabled', async () => {
  motion.reduced = true
  let renderer: ReactTestRenderer
  await act(async () => { renderer = create(<LyricAdjustmentSheet visible offsetMs={0} onAdjust={vi.fn()} onClose={vi.fn()} />) })
  expect(renderer!.root.findByType('Modal' as never).props.animationType).toBe('none')
  await act(async () => renderer!.unmount())
  motion.reduced = false
})
