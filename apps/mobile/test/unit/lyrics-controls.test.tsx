import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ listener: undefined as undefined | ((name: string) => void), callbacks: null as null | { toggle: () => void; touchStart: () => void; touchEnd: () => void } }))
vi.mock('react-native', () => ({ View: 'View',
  AppState: { currentState: 'active', addEventListener: (_event: string, listener: (name: string) => void) => { state.listener = listener; return { remove: vi.fn() } } },
  AccessibilityInfo: { isScreenReaderEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove: vi.fn() }) },
}))
import { useLyricsControls } from '../../src/components/player/use-lyrics-controls'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let renderer: ReactTestRenderer
let props = { active: true, identity: 'qid-1', playing: true, ready: true, locked: false, forceVisible: false }
function Probe() {
  const controls = useLyricsControls(props)
  React.useEffect(() => { state.callbacks = controls }, [controls])
  return <View testID="probe" accessibilityLabel={String(controls.visible)} />
}
const button = () => renderer.root.findByProps({ testID: 'probe' })
const controls = () => state.callbacks!
async function render() {
  await act(async () => { renderer = create(<Probe />) })
}
async function update(next: Partial<typeof props>) {
  props = { ...props, ...next }
  await act(async () => { renderer.update(<Probe />) })
}
beforeEach(() => {
  vi.useFakeTimers()
  props = { active: true, identity: 'qid-1', playing: true, ready: true, locked: false, forceVisible: false }
})
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount())
  vi.useRealTimers()
})

describe('shared lyrics controls visibility', () => {
  it.each([{ ready: false }, { playing: false }, { forceVisible: true }])('forces unavailable or paused controls visible and starts a fresh interval after recovery: %j', async (change) => {
    await render()
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(button().props.accessibilityLabel).toBe('false')
    await update(change)
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(button().props.accessibilityLabel).toBe('true')
    await update({ ready: true, playing: true, forceVisible: false })
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(button().props.accessibilityLabel).toBe('false')
  })

  it('cancels an old-song timer and gives each queue occurrence its full interval', async () => {
    await render()
    await act(async () => { vi.advanceTimersByTime(3900) })
    await update({ identity: 'same-track-new-qid' })
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(button().props.accessibilityLabel).toBe('false')
  })
  it('hides after four idle seconds and gives a full interval after reveal', async () => {
    await render()
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(button().props.accessibilityLabel).toBe('false')
    await act(async () => controls().toggle())
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(button().props.accessibilityLabel).toBe('false')
  })

  it('keeps paused controls available and prevents manual hiding until playback resumes', async () => {
    await render()
    await update({ playing: false, forceVisible: true })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => controls().toggle())
    expect(button().props.accessibilityLabel).toBe('true')
    await update({ playing: true, forceVisible: false })
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(button().props.accessibilityLabel).toBe('false')
  })

  it('locks the current state through interactions and modal restore', async () => {
    await render()
    await act(async () => controls().touchStart())
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => controls().touchEnd())
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await update({ locked: true })
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(button().props.accessibilityLabel).toBe('true')
    await update({ locked: false })
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(button().props.accessibilityLabel).toBe('false')
  })

  it('restarts readiness timing and cancels timers while inactive', async () => {
    await render()
    await act(async () => { vi.advanceTimersByTime(2000) })
    await update({ ready: false })
    await update({ ready: true })
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await update({ active: false })
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(button().props.accessibilityLabel).toBe('true')
    await update({ active: true })
    expect(button().props.accessibilityLabel).toBe('true')
  })

  it('reveals for unavailable lyrics and a new queue identity, while modal locks preserve hidden state', async () => {
    await render()
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(button().props.accessibilityLabel).toBe('false')
    await update({ identity: 'qid-2', ready: false, forceVisible: true })
    expect(button().props.accessibilityLabel).toBe('true')
    await update({ ready: true, forceVisible: false })
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(button().props.accessibilityLabel).toBe('false')
    await update({ locked: true })
    await act(async () => { vi.advanceTimersByTime(8000) })
    await update({ locked: false })
    expect(button().props.accessibilityLabel).toBe('false')
  })

  it('does not lose a held touch when an external lock changes', async () => {
    await render()
    await act(async () => controls().touchStart())
    await update({ locked: true })
    await update({ locked: false })
    await act(async () => { vi.advanceTimersByTime(8000) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => controls().touchEnd())
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(button().props.accessibilityLabel).toBe('false')
  })

  it('reveals on foreground return and gives a fresh idle interval', async () => {
    await render()
    await act(async () => { vi.advanceTimersByTime(4000) })
    await act(async () => state.listener?.('background'))
    await act(async () => { vi.advanceTimersByTime(8000) })
    await act(async () => state.listener?.('active'))
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(button().props.accessibilityLabel).toBe('true')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(button().props.accessibilityLabel).toBe('false')
  })
})
