import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const scenario = vi.hoisted(() => ({
  sheet: { synced: true, lines: [] as { atMs: number; text: string; words?: { atMs: number; text: string }[] }[] },
  queryOverride: {} as Record<string, unknown>, refetch: vi.fn(),
  copy: vi.fn(), share: vi.fn(), offsetMs: 0, reduceMotion: false, scrollTo: vi.fn(), themeReads: vi.fn(), timing: vi.fn(),
}))
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', Pressable: 'Pressable',
  ScrollView: 'ScrollView', Text: 'Text', View: 'View', Share: { share: scenario.share },
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  useWindowDimensions: () => ({ height: 844, width: 390 }),
}))
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react')
  return {
    default: { ScrollView: 'AnimatedScrollView', View: 'AnimatedView', Text: 'AnimatedText' },
    Easing: { bezier: vi.fn(), linear: vi.fn(), out: vi.fn(), cubic: vi.fn() },
    useAnimatedRef: () => useRef(null),
    useSharedValue: (value: number) => useRef({ value }).current,
    useAnimatedStyle: () => ({}), useAnimatedScrollHandler: (h: unknown) => h,
    useReducedMotion: () => scenario.reduceMotion,
    withTiming: (v: unknown, config: unknown, done?: (finished: boolean) => void) => { scenario.timing(v, config); done?.(true); return v }, runOnJS: (fn: unknown) => fn,
  }
})
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }))
vi.mock('react-native-track-player', () => ({ useIsPlaying: () => ({ playing: true }) }))
vi.mock('expo-clipboard', () => ({ setStringAsync: scenario.copy }))
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(() => Promise.resolve()), impactAsync: vi.fn(() => Promise.resolve()), ImpactFeedbackStyle: {} }))
vi.mock('../../src/components/list-states', () => ({ ErrorState: 'ErrorState' }))
vi.mock('../../src/components/player/lyric-stage-mask', () => ({ LyricStageMask: 'LyricStageMask' }))
vi.mock('../../src/components/icon', () => ({ Icon: 'Icon', IconButton: 'IconButton', iconSize: {} }))
vi.mock('../../src/lib/lyric-offset', () => ({ useLyricSheet: () => ({ data: scenario.sheet, refetch: scenario.refetch, ...scenario.queryOverride }) }))
vi.mock('../../src/player/store', () => ({ usePlayerStore: () => scenario.offsetMs }))
vi.mock('../../src/theme/theme-provider', () => ({
  useThemeColors: () => { scenario.themeReads(); return { textPrimary: 'white', textSecondary: 'gray', textTertiary: 'gray' } },
  createThemedStyles: (factory: (colors: object) => unknown) => {
    const styles = factory({})
    return () => styles
  },
}))
import { LyricView, isDownwardRevealFling } from '../../src/components/lyric-view'

// Real React renders/effects/memo. Native drawing is stubbed: this does NOT measure FPS or inertia.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let renderer: ReactTestRenderer
let sequence = 0
let props: React.ComponentProps<typeof LyricView>
const scroll = () => renderer.root.findByType('AnimatedScrollView' as never)
const rows = () => renderer.root.findAllByType('Pressable' as never)
const event = (y: number) => ({ nativeEvent: { contentOffset: { y }, velocity: { y: 0 } } })
async function update(changes: Partial<typeof props>) {
  props = { ...props, ...changes }
  await act(async () => { renderer.update(<LyricView key={props.trackId} {...props} />) })
}
async function mount() {
  await act(async () => {
    renderer = create(<LyricView key={props.trackId} {...props} />, {
      createNodeMock: (el) => el.type === 'AnimatedScrollView' ? { scrollTo: scenario.scrollTo } : null,
    })
  })
  await act(async () => { scroll().props.onLayout({ nativeEvent: { layout: { height: 500 } } }) })
  await act(async () => {
    rows().forEach((row, index) => row.props.onLayout?.({ nativeEvent: { layout: { y: index * 100, height: 70 } } }))
  })
  scenario.scrollTo.mockClear()
  scenario.themeReads.mockClear()
}
async function dragAndRelease(y = 0) {
  await act(async () => { scroll().props.onTouchStart({ nativeEvent: { pageX: 40, pageY: 200 } }) })
  await act(async () => { scroll().props.onScrollBeginDrag() })
  await act(async () => { scroll().props.onScrollEndDrag(event(y)) })
  await act(async () => { scroll().props.onTouchEnd({ nativeEvent: { pageX: 40, pageY: 260 } }) })
}
beforeEach(() => {
  vi.useFakeTimers()
  scenario.sheet = { synced: true, lines: Array.from({ length: 12 }, (_, i) => ({ atMs: i * 1000, text: `Line ${i}` })) }
  scenario.queryOverride = {}
  scenario.refetch.mockReset().mockResolvedValue(undefined)
  scenario.copy.mockReset().mockResolvedValue(undefined)
  scenario.share.mockReset().mockResolvedValue({ action: 'dismissedAction' })
  scenario.offsetMs = 0
  scenario.reduceMotion = false
  props = { trackId: `motion-${++sequence}`, positionMs: 0, playing: true, active: true, onSeek: vi.fn() }
  scenario.scrollTo.mockClear()
})
afterEach(async () => {
  if (renderer) await act(async () => { renderer.unmount() })
  vi.useRealTimers()
})
describe('lyric follow interaction', () => {
  it('offers retry for failed lyrics, shows loading during retry, then reports recovered content', async () => {
    const ready = vi.fn()
    const failed = vi.fn()
    props = { ...props, onLyricsReadyChange: ready, onLyricsErrorChange: failed }
    scenario.queryOverride = { data: null, isError: true, isFetching: false, error: new Error('Network interrupted') }
    await act(async () => { renderer = create(<LyricView key={props.trackId} {...props} />) })
    expect(ready).toHaveBeenLastCalledWith(false)
    expect(failed).toHaveBeenLastCalledWith(true)
    const errorState = renderer.root.findByType('ErrorState' as never)
    await act(async () => { errorState.props.onRetry() })
    expect(scenario.refetch).toHaveBeenCalledOnce()
    scenario.queryOverride = { ...scenario.queryOverride, isFetching: true }
    await update({})
    expect(renderer.root.findAllByType('ErrorState' as never)).toHaveLength(0)
    expect(renderer.root.findAllByType('ActivityIndicator' as never)).toHaveLength(1)
    scenario.queryOverride = {}
    await update({})
    expect(ready).toHaveBeenLastCalledWith(true)
    expect(failed).toHaveBeenLastCalledWith(false)
    expect(scroll()).toBeTruthy()
  })

  it('retains usable lyrics when a background refresh fails', async () => {
    const failed = vi.fn()
    props = { ...props, onLyricsErrorChange: failed }
    scenario.queryOverride = { isError: true, error: new Error('Refresh failed') }
    await mount()
    expect(renderer.root.findAllByType('ErrorState' as never)).toHaveLength(0)
    expect(rows().length).toBeGreaterThan(0)
    expect(failed).toHaveBeenLastCalledWith(false)
  })

  it('classifies only a downward fling that clears both release thresholds', () => {
    expect(isDownwardRevealFling(24, 650)).toBe(true)
    expect(isDownwardRevealFling(23, 900)).toBe(false)
    expect(isDownwardRevealFling(80, 649)).toBe(false)
    expect(isDownwardRevealFling(80, -900)).toBe(false)
  })

  it('reveals controls on a qualifying hidden-start fling and consumes the gesture before dismissal', async () => {
    const translation = { value: 0, get: vi.fn(() => 0), set: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), modify: vi.fn() }
    const dismiss = vi.fn()
    const reveal = vi.fn()
    props = { ...props, translateY: translation, onDismiss: dismiss, immersive: true, controlsVisible: false, onFlingReveal: reveal }
    await mount()
    const handler = scroll().props.onScroll
    handler.onBeginDrag({ contentOffset: { y: 0 } })
    handler.onScroll({ contentOffset: { y: -40 } })
    handler.onEndDrag({ contentOffset: { y: -40 }, velocity: { y: -0.7 } })
    expect(reveal).toHaveBeenCalledOnce()
    expect(dismiss).not.toHaveBeenCalled()
    expect(translation.value).toBe(0)
  })
  it('only dismisses when a pull starts at the top, never when browsing reaches the top', async () => {
    const translation = { value: 0, get: vi.fn(() => 0), set: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), modify: vi.fn() }
    const dismiss = vi.fn()
    props = { ...props, translateY: translation, onDismiss: dismiss }
    await mount()
    const handler = scroll().props.onScroll
    handler.onBeginDrag({ contentOffset: { y: 120 } })
    handler.onScroll({ contentOffset: { y: -140 } })
    handler.onEndDrag({ contentOffset: { y: -140 }, velocity: { y: 0 } })
    expect(dismiss).not.toHaveBeenCalled()
    expect(translation.value).toBe(0)
    handler.onBeginDrag({ contentOffset: { y: 0 } })
    handler.onScroll({ contentOffset: { y: -20 } })
    expect(translation.value).toBe(20)
    handler.onEndDrag({ contentOffset: { y: -20 }, velocity: { y: 0 } })
    expect(translation.value).toBe(0)
    expect(dismiss).not.toHaveBeenCalled()
    handler.onBeginDrag({ contentOffset: { y: 0 } })
    handler.onScroll({ contentOffset: { y: -110 } })
    handler.onEndDrag({ contentOffset: { y: -110 }, velocity: { y: 0 } })
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('does not reveal or move the sheet for an upward fling or a slow downward pull that started hidden', async () => {
    const translation = { value: 0, get: vi.fn(() => 0), set: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), modify: vi.fn() }
    const reveal = vi.fn()
    const dismiss = vi.fn()
    props = { ...props, immersive: true, controlsVisible: false, onFlingReveal: reveal, translateY: translation, onDismiss: dismiss }
    await mount()
    const handler = scroll().props.onScroll
    handler.onBeginDrag({ contentOffset: { y: 0 } })
    handler.onScroll({ contentOffset: { y: -140 } })
    expect(translation.value).toBe(0)
    handler.onEndDrag({ contentOffset: { y: -140 }, velocity: { y: -0.2 } })
    handler.onBeginDrag({ contentOffset: { y: 140 } })
    handler.onEndDrag({ contentOffset: { y: 400 }, velocity: { y: 1.2 } })
    expect(reveal).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('starts the six-second reading window after inertia ends and follows the latest line', async () => {
    await mount()
    await dragAndRelease(400)
    await act(async () => scroll().props.onMomentumScrollBegin())
    await update({ positionMs: 6000 })
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => scroll().props.onMomentumScrollEnd())
    await act(async () => { vi.advanceTimersByTime(5999) })
    await update({ positionMs: 8000 })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 618, animated: true })
  })

  it('holds reading position under a blank-area touch and restarts the full window when cancelled', async () => {
    await mount()
    await dragAndRelease(400)
    await act(async () => { vi.advanceTimersByTime(5000) })
    await act(async () => scroll().props.onTouchStart({ nativeEvent: { pageX: 12, pageY: 300 } }))
    await update({ positionMs: 8000 })
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => scroll().props.onTouchCancel())
    await act(async () => { vi.advanceTimersByTime(5999) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 618, animated: true })
  })

  it.each([{ followLocked: true }, { foreground: false }])('protects manual reading while locked: %j', async (lock) => {
    await mount()
    await dragAndRelease(400)
    await update({ ...lock, positionMs: 8000 })
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await update({ followLocked: false, foreground: true })
    await act(async () => { vi.advanceTimersByTime(5999) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 618, animated: true })
  })

  it('removes the return chip when timed following resumes', async () => {
    props = { ...props, immersive: true }
    await mount()
    await dragAndRelease(800)
    await act(async () => scroll().props.onScroll.onScroll({ contentOffset: { y: 800 } }))
    expect(renderer.root.findAllByProps({ accessibilityLabel: '回到当前句' })).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(renderer.root.findAllByProps({ accessibilityLabel: '回到当前句' })).toHaveLength(0)
  })

  it('recovers after a fast drag at the edge when native momentum never begins', async () => {
    await mount()
    await act(async () => scroll().props.onScrollBeginDrag())
    await act(async () => scroll().props.onScrollEndDrag({ nativeEvent: { contentOffset: { y: 0 }, velocity: { y: 2 } } }))
    await update({ positionMs: 8000 })
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 618, animated: true })
  })

  it('protects manual reading even when the current line moves outside the viewport', async () => {
    await mount()
    await dragAndRelease()
    await update({ positionMs: 9000 })
    await act(async () => { vi.advanceTimersByTime(5999) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 718, animated: true })
    expect(renderer.root.findAllByProps({ accessibilityLabel: '回到当前句' })).toHaveLength(0)
  })
  it('does not scroll under a held lyric or while the full lyric sheet is open', async () => {
    await mount()
    await act(async () => { rows()[0]!.props.onPressIn() })
    await update({ positionMs: 3000 })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => { rows()[0]!.props.onLongPress(); rows()[0]!.props.onPressOut() })
    await update({ positionMs: 8000 })
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => renderer.root.findByType('Modal' as never).props.onRequestClose())
    await update({ positionMs: 9000 })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 718, animated: true })
  })
  it('keeps a lyric row tap from toggling portrait controls and cancels a tap that began during inertia', async () => {
    const blankTap = vi.fn()
    props = { ...props, immersive: true, onBlankTap: blankTap }
    await mount()
    const start = { nativeEvent: { pageX: 120, pageY: 200 } }
    const end = { nativeEvent: { pageX: 120, pageY: 200 } }
    await act(async () => scroll().props.onTouchStart(start))
    await act(async () => rows()[1]!.props.onPressIn())
    await act(async () => rows()[1]!.props.onPressOut())
    await act(async () => rows()[1]!.props.onPress())
    await act(async () => scroll().props.onTouchEnd(end))
    expect(blankTap).not.toHaveBeenCalled()
    expect(props.onSeek).toHaveBeenCalledOnce()

    props.onSeek = vi.fn()
    await update({ positionMs: 0 })
    await dragAndRelease(100)
    await act(async () => scroll().props.onMomentumScrollBegin())
    await act(async () => rows()[0]!.props.onPressIn())
    await act(async () => scroll().props.onMomentumScrollEnd())
    await act(async () => rows()[0]!.props.onPressOut())
    await act(async () => rows()[0]!.props.onPress())
    expect(props.onSeek).not.toHaveBeenCalled()
    expect(blankTap).not.toHaveBeenCalled()
  })

  it('does not treat automatic lyric following as a user interaction', async () => {
    const start = vi.fn()
    const end = vi.fn()
    props = { ...props, immersive: true, onInteractionStart: start, onInteractionEnd: end }
    await mount()
    await update({ positionMs: 3000 })
    await act(async () => scroll().props.onMomentumScrollBegin())
    await act(async () => scroll().props.onMomentumScrollEnd())
    expect(start).not.toHaveBeenCalled()
    expect(end).not.toHaveBeenCalled()
    await dragAndRelease(100)
    await act(async () => scroll().props.onMomentumScrollBegin())
    await act(async () => scroll().props.onMomentumScrollEnd())
    expect(start).toHaveBeenCalledTimes(2)
    expect(end).toHaveBeenCalledTimes(2)
  })

  it('offers return to current only after a manual browse moves the active line offscreen', async () => {
    const showReturn = vi.fn()
    props = { ...props, immersive: true, onReadingPositionChange: showReturn }
    await mount()
    await act(async () => scroll().props.onScrollBeginDrag())
    const handler = scroll().props.onScroll
    await act(async () => handler.onScroll({ contentOffset: { y: 800 } }))
    expect(showReturn).toHaveBeenLastCalledWith(true)
    expect(renderer.root.findAllByProps({ accessibilityLabel: '回到当前句' })).toHaveLength(1)
    await update({ positionMs: 9000 })
    expect(showReturn).toHaveBeenCalledWith(true)
  })

  it('confirms copying only after the clipboard succeeds, and keeps retry available on failure', async () => {
    await mount()
    await act(async () => rows()[0]!.props.onLongPress())
    scenario.copy.mockRejectedValueOnce(new Error('clipboard unavailable'))
    const copyButton = () => rows().find((r) => String(r.props.accessibilityLabel).includes('复制'))!
    await act(async () => copyButton().props.onPress())
    expect(copyButton().props.accessibilityLabel).toBe('复制失败，重试')
    await act(async () => copyButton().props.onPress())
    expect(copyButton().props.accessibilityLabel).toBe('已复制')
  })
  it('selects the long-pressed line, exports in lyric order and preserves selection after share failure', async () => {
    await mount()
    await act(async () => rows()[2]!.props.onLongPress())
    const modal = renderer.root.findByType('Modal' as never)
    expect(modal.props.presentationStyle).toBe('pageSheet')
    expect(modal.props.allowSwipeDismissal).toBe(true)
    const choices = () => rows().filter((r) => r.props.accessibilityRole === 'checkbox')
    expect(choices().filter((r) => r.props.accessibilityState.checked).map((r) => r.props.accessibilityLabel)).toEqual(['Line 2'])
    await act(async () => choices()[0]!.props.onPress())
    const shareButton = () => rows().find((r) => r.props.accessibilityLabel === '分享所选歌词')!
    scenario.share.mockRejectedValueOnce(new Error('unavailable'))
    await act(async () => shareButton().props.onPress())
    expect(scenario.share).toHaveBeenLastCalledWith({ message: 'Line 0\nLine 2' })
    expect(choices().filter((r) => r.props.accessibilityState.checked)).toHaveLength(2)
    expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })[0]!.props.children).toBe('分享未完成，请重试')
    await act(async () => shareButton().props.onPress())
    expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0)
    await act(async () => choices()[0]!.props.onPress())
    await act(async () => choices()[2]!.props.onPress())
    expect(shareButton().props.disabled).toBe(true)
    await act(async () => shareButton().props.onPress())
    expect(scenario.share).toHaveBeenCalledTimes(2)
  })

  it('does not present untimed lyrics as an active timed line', async () => {
    scenario.sheet.synced = false
    await mount()
    expect(rows().some((r) => String(r.props.accessibilityLabel).includes('正在播放'))).toBe(false)
    expect(renderer.root.findAllByType('Text' as never).some((r) => r.props.children === '当前歌词不支持逐句同步')).toBe(true)
  })

  it('does not interpolate focus or word progress with Reduce Motion' , async () => {
    scenario.reduceMotion = true
    scenario.sheet.lines[0]!.words = [{ atMs: 0, text: 'Li' }, { atMs: 500, text: 'ne 0' }]
    await mount()
    scenario.timing.mockClear()
    await update({ positionMs: 800 })
    await update({ positionMs: 1000 })
    expect(scenario.timing).not.toHaveBeenCalled()
  })

  it('highlights only at the lyric timestamp and ignores untimed metadata', async () => {
    scenario.sheet.lines = [
      { atMs: -99999, text: '歌手：示例' },
      { atMs: 1000, text: '第一句' },
      { atMs: 2000, text: '第二句' },
    ]
    await mount()
    expect(rows()[0]?.props.onPress).toBeUndefined()
    expect(rows()[0]?.props.accessibilityRole).toBe('text')
    expect(rows()[1]?.props.onPress).toBeTypeOf('function')
    expect(rows().some((row) => row.props.accessibilityLabel.includes('正在播放'))).toBe(false)
    await update({ positionMs: 999 })
    expect(rows().some((row) => row.props.accessibilityLabel.includes('正在播放'))).toBe(false)
    await update({ positionMs: 1000 })
    expect(rows()[1]?.props.accessibilityLabel).toContain('正在播放')
    await update({ positionMs: 2000 })
    expect(rows()[2]?.props.accessibilityLabel).toContain('正在播放')
    expect(rows()[1]?.props.accessibilityLabel).not.toContain('正在播放')
  })
  it('treats timestamped information rows as ordinary seekable lyric rows', async () => {
    scenario.sheet.lines = [
      { atMs: 0, text: '第一句' },
      { atMs: 500, text: '演唱：示例' },
      { atMs: 1000, text: '第二句' },
    ]
    await mount()
    expect(rows()[1]?.props.onPress).toBeTypeOf('function')
    expect(rows()[1]?.props.accessibilityRole).toBe('button')
    await update({ positionMs: 500 })
    expect(rows()[1]?.props.accessibilityLabel).toContain('正在播放')
    await act(async () => rows()[1]?.props.onPress())
    expect(props.onSeek).toHaveBeenLastCalledWith(0.5)
  })
  it('applies the current song offset at the exact line boundary', async () => {
    props.offsetMs = 500
    props.positionMs = 499
    await mount()
    expect(rows()[1]?.props.accessibilityLabel).not.toContain('正在播放')
    await update({ positionMs: 500 })
    expect(rows()[1]?.props.accessibilityLabel).toContain('正在播放')
  })
  it('keeps contentOffset fixed across line changes and scrolls forward/backward with animation', async () => {
    await mount()
    const initial = scroll().props.contentOffset
    await update({ positionMs: 4000 })
    expect(scroll().props.contentOffset).toBe(initial)
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 218, animated: true })
    await update({ positionMs: 2000 })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 18, animated: true })
  })
  it('only renders the parent on an ordinary tick, and the old/new row on a line transition', async () => {
    await mount()
    await update({ positionMs: 200 })
    expect(scenario.themeReads).toHaveBeenCalledTimes(1)
    scenario.themeReads.mockClear()
    await update({ positionMs: 1000 })
    expect(scenario.themeReads).toHaveBeenCalledTimes(3)
  })
  it('does not move the viewport while dragging, including through contentOffset', async () => {
    await mount()
    const initial = scroll().props.contentOffset
    await act(async () => { scroll().props.onScrollBeginDrag() })
    await update({ positionMs: 8000 })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    expect(scroll().props.contentOffset).toBe(initial)
  })
  it('returns to the latest line after idle, not the line at drag-end', async () => {
    await mount()
    await dragAndRelease()
    await update({ positionMs: 3000 })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 118, animated: true })
  })
  it('stays at the manual position while paused and gives a full reading interval on resume', async () => {
    await mount()
    await dragAndRelease()
    await update({ playing: false, positionMs: 4000 })
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await update({ playing: true })
    await act(async () => { vi.advanceTimersByTime(5999) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 218, animated: true })
  })
  it('does not let the idle timer move a hidden page', async () => {
    await mount()
    await dragAndRelease()
    await update({ active: false, positionMs: 4000 })
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
  })
  it('returns to the exact current line after leaving and reopening lyrics', async () => {
    await mount()
    await update({ active: false, positionMs: 4000 })
    expect(scenario.scrollTo).not.toHaveBeenCalled()
    await update({ active: true })
    expect(rows()[4]?.props.accessibilityLabel).toContain('正在播放')
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 218, animated: false })
  })
  it('pre-mounts the first timed line and retains both outgoing/incoming character trees', async () => {
    scenario.sheet.lines.forEach((line) => { line.atMs += 1000 })
    for (const line of scenario.sheet.lines.slice(0, 2)) {
      line.words = [{ atMs: line.atMs, text: 'Li' }, { atMs: line.atMs + 500, text: line.text.slice(2) }]
    }
    await mount() // before the first timestamp
    const before = renderer.root.findAllByType('AnimatedText' as never)
    expect(before).toHaveLength(12)
    await update({ positionMs: 1000 })
    expect(renderer.root.findAllByType('AnimatedText' as never)[0]).toBe(before[0])
    await update({ positionMs: 2000 })
    const after = renderer.root.findAllByType('AnimatedText' as never)
    expect(after).toHaveLength(12)
    expect(after[0]).toBe(before[0])
    expect(after[6]).toBe(before[6])
  })
  it('starts each keyed track at its own cached offset, without retaining the previous song position', async () => {
    // Reproduce the keyed LyricView lifetime used by LyricPage in app/player.tsx.
    await mount()
    const firstTrack = props.trackId
    await update({ positionMs: 4000 })
    await act(async () => { scroll().props.onScrollBeginDrag() })
    await update({ trackId: `${firstTrack}-new`, positionMs: 0 })
    expect(scroll().props.contentOffset.y).toBe(0)
    await update({ trackId: firstTrack, positionMs: 4000 })
    expect(scroll().props.contentOffset.y).toBe(218)
  })
  it('subtracts the lyric offset when seeking and clamps negative times', async () => {
    scenario.offsetMs = 500
    await mount()
    await act(async () => { rows()[3]!.props.onPress() })
    expect(props.onSeek).toHaveBeenCalledWith(2.5)
    await act(async () => { rows()[0]!.props.onPress() })
    expect(props.onSeek).toHaveBeenLastCalledWith(0)
  })
  it('updates the follow position when bottom toolbar spacing changes', async () => {
    await mount()
    await update({ positionMs: 4000, bottomSpace: 100 })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 256, animated: true })
  })
  it('keeps end padding fixed while the stage controls mask fades', async () => {
    const opacity = { value: 1, get: vi.fn(() => 1), set: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), modify: vi.fn() }
    props = {
      ...props,
      immersive: true,
      bottomSpace: 100,
      stageMask: { opacity, topInset: 50, bottomInset: 100, topFloor: 50, bottomFloor: 34 },
    }
    await mount()
    const initialStyle = scroll().props.contentContainerStyle as { paddingBottom?: number }[]
    const initialPadding = initialStyle[1]?.paddingBottom

    opacity.value = 0
    await update({ controlsVisible: false })

    const hiddenStyle = scroll().props.contentContainerStyle as { paddingBottom?: number }[]
    expect(hiddenStyle[1]?.paddingBottom).toBe(initialPadding)
  })
  it('respects Reduce Motion for automatic following', async () => {
    scenario.reduceMotion = true
    await mount()
    await update({ positionMs: 3000 })
    await update({ positionMs: 4000 })
    expect(scenario.scrollTo).toHaveBeenLastCalledWith({ y: 218, animated: false })
  })
  it('bounds animated characters to neighboring lines even with a long word-timed lyric', async () => {
    scenario.sheet.lines = Array.from({ length: 300 }, (_, i) => ({
      atMs: i * 1000, text: 'abcdefghijklmnopqrst',
      words: [{ atMs: i * 1000, text: 'abcdefghij' }, { atMs: i * 1000 + 500, text: 'klmnopqrst' }],
    }))
    await mount()
    expect(renderer.root.findAllByType('AnimatedText' as never).length).toBeLessThanOrEqual(60)
    await update({ positionMs: 150000 })
    expect(renderer.root.findAllByType('AnimatedText' as never)).toHaveLength(60)
  })
  it('resets word progress immediately on backward seek instead of animating a reverse wipe', async () => {
    scenario.sheet.lines[0]!.words = [{ atMs: 0, text: 'Li' }, { atMs: 500, text: 'ne 0' }]
    await mount()
    scenario.timing.mockClear()
    await update({ positionMs: 800 })
    expect(scenario.timing).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ duration: 100 }))
    scenario.timing.mockClear()
    await update({ positionMs: 200 })
    expect(scenario.timing).not.toHaveBeenCalled()
  })

})
