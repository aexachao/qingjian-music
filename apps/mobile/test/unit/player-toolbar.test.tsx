import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ playing: false, waiting: false, loading: false, play: vi.fn(), next: vi.fn(), toast: vi.fn() }))
vi.mock('react-native', () => ({ ActivityIndicator: 'Spinner', Pressable: 'Pressable', Text: 'Text', View: 'View' }))
vi.mock('react-native-svg', () => ({ default: 'Svg', Defs: 'Defs', G: 'G', Mask: 'Mask', Path: 'Path', Rect: 'Rect' }))
vi.mock('react-native-track-player', () => ({ useIsPlaying: () => ({ playing: state.playing }) }))
vi.mock('../../modules/airplay-button', () => ({ AirplayRouteButton: 'Airplay' }))
vi.mock('../../src/components/icon', () => ({ Icon: 'Icon' }))
vi.mock('../../src/components/toast', () => ({ useToast: () => state.toast }))
vi.mock('../../src/lib/haptics', () => ({ tap: vi.fn() }))
vi.mock('../../src/player/controller', () => ({ togglePlay: () => state.play(), skipToNextSafe: () => state.next() }))
vi.mock('../../src/player/playback-intent', () => ({ usePlaybackIntent: (selector: (s: object) => unknown) => selector({ waitingForNetwork: state.waiting }) }))
vi.mock('../../src/player/use-audio-loading', () => ({ useIsAudioLoading: () => state.loading }))
vi.mock('../../src/theme/theme-provider', () => ({ useThemeColors: () => ({}), createThemedStyles: (factory: (c: object) => unknown) => () => factory({}) }))
import { LyricsPlaybackControls, PlayerToolbar } from '../../src/components/player/player-toolbar'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let renderer: ReactTestRenderer
const changeMode = vi.fn()
async function mount(mode?: 'cover' | 'lyrics' | 'list') {
  await act(async () => { renderer = create(mode ? <PlayerToolbar mode={mode} onModeChange={changeMode} bottomInset={34} /> : <LyricsPlaybackControls />) })
}
const button = (label: string) => renderer.root.findAllByType('Pressable' as never).find((b) => b.props.accessibilityLabel === label)!
beforeEach(() => { state.playing = false; state.waiting = false; state.loading = false; state.play.mockReset().mockResolvedValue(undefined); state.next.mockReset().mockResolvedValue(undefined); state.toast.mockReset(); changeMode.mockReset() })
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()) })
it('keeps playback actions out of the persistent toolbar in every mode', async () => {
  await mount('cover')
  expect(button('播放')).toBeUndefined()
  await act(async () => button('歌词').props.onPress())
  expect(changeMode).toHaveBeenCalledWith('lyrics')
  await act(async () => renderer.update(<PlayerToolbar mode="lyrics" onModeChange={changeMode} bottomInset={34} />))
  expect(button('歌词').props.accessibilityState.selected).toBe(true)
  expect(button('播放')).toBeUndefined()
  expect(button('下一首')).toBeUndefined()
  await act(async () => button('歌词').props.onPress())
  expect(changeMode).toHaveBeenLastCalledWith('cover')
})
it('exposes pause/cancel intent and keeps network recovery cancellable', async () => {
  state.playing = true
  await mount()
  expect(button('暂停')).toBeDefined()
  state.playing = false; state.waiting = true; state.loading = true
  await act(async () => renderer.update(<LyricsPlaybackControls />))
  await act(async () => button('取消网络恢复后续播').props.onPress())
  expect(state.play).toHaveBeenCalledOnce()
  expect(renderer.root.findAllByType('Spinner' as never)).toHaveLength(0)
})
it('reports next-track errors without switching away from lyrics', async () => {
  state.next.mockRejectedValue(new Error('无法切歌'))
  await mount()
  await act(async () => button('下一首').props.onPress())
  expect(state.toast).toHaveBeenCalledWith('无法切歌')
  expect(changeMode).not.toHaveBeenCalled()
})
it('shows actual external route names and clears the caption on disconnect', async () => {
  await mount('lyrics')
  const route = renderer.root.findByType('Airplay' as never)
  await act(async () => route.props.onRouteChange({ nativeEvent: { name: 'Studio Headphones', external: true } }))
  const labels = () => renderer.root.findAllByType('Text' as never)
  expect(labels()[0]?.props.children).toBe('Studio Headphones')
  await act(async () => route.props.onRouteChange({ nativeEvent: { name: 'iPhone', external: false } }))
  expect(labels()).toHaveLength(0)
})

it('runs playback from the separate lyric controls', async () => {
  await mount()
  await act(async () => { button('播放').props.onPress(); button('下一首').props.onPress() })
  expect(state.play).toHaveBeenCalledOnce()
  expect(state.next).toHaveBeenCalledOnce()
})
