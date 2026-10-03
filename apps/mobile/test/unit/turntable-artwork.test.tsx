import React from 'react'
import { createRequire } from 'node:module'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterAll, afterEach, expect, it, vi } from 'vitest'

const loader = createRequire(import.meta.url)
const previous = loader.extensions['.png']
loader.extensions['.png'] = (module) => { module.exports = 1 }
afterAll(() => { if (previous) loader.extensions['.png'] = previous; else delete loader.extensions['.png'] })
vi.mock('react-native', () => ({ Image: 'BodyImage', View: 'View', StyleSheet: { create: (v: unknown) => v, absoluteFill: {} } }))
vi.mock('expo-image', () => ({ Image: 'ArtworkImage' }))
vi.mock('react-native-svg', () => ({ default: 'Svg', Circle: 'Circle', Defs: 'Defs', Ellipse: 'Ellipse', G: 'G', LinearGradient: 'LinearGradient', Path: 'Path', RadialGradient: 'RadialGradient', Stop: 'Stop' }))
vi.mock('../../src/theme/theme-provider', () => ({ useThemeColors: () => ({}) }))
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react')
  return {
    default: { View: 'AnimatedView', createAnimatedComponent: (v: unknown) => v },
    Easing: { linear: 'linear' }, cancelAnimation: vi.fn(),
    useSharedValue: (value: number) => useRef({ value }).current,
    useAnimatedProps: (fn: () => unknown) => fn(), useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (value: number) => value,
  }
})
import { TurntableIllustration } from '../../src/screens/home/TurntableIllustration'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let renderer: ReactTestRenderer
const angle = { value: 80 } as never
const one = { url: 'https://example.invalid/one.jpg', headers: { Authorization: 'test-header' } }
const two = { url: 'https://example.invalid/two.jpg' }
const artwork = () => renderer.root.findAllByType('ArtworkImage' as never)
const render = (resource = one, engaged = true, emitting = true) => <TurntableIllustration angle={angle} engaged={engaged} emitting={emitting} reduceMotion artwork={resource} artworkKey="test-server:test-track" />
afterEach(async () => { await act(async () => renderer?.unmount()) })

it('preserves authenticated artwork when paused and removes it outside roaming', async () => {
  await act(async () => { renderer = create(render()) })
  expect(artwork()[0].props.source.headers).toEqual(one.headers)
  await act(async () => renderer.update(render(one, true, false)))
  expect(artwork()).toHaveLength(1)
  expect(artwork()[0].props.source.uri).toBe(one.url)
  await act(async () => renderer.update(render(one, false, false)))
  expect(artwork()).toHaveLength(0)
})

it('falls back after image failure and ignores a late error for a previous song', async () => {
  await act(async () => { renderer = create(render()) })
  const oldError = artwork()[0].props.onError
  await act(async () => oldError())
  expect(artwork()).toHaveLength(0)
  await act(async () => renderer.update(render(two as typeof one)))
  expect(artwork()[0].props.source.uri).toBe(two.url)
  await act(async () => oldError())
  expect(artwork()[0].props.source.uri).toBe(two.url)
  await act(async () => renderer.update(render(one)))
  expect(artwork()[0].props.source.uri).toBe(one.url)
})
