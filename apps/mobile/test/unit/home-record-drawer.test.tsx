import React from 'react'
import { createRequire } from 'node:module'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Metro treats PNGs as numeric assets; Node needs a loader for the same static require.
const assetRequire = createRequire(import.meta.url)
const priorPngLoader = assetRequire.extensions['.png']
assetRequire.extensions['.png'] = (module) => { module.exports = 1 }
afterAll(() => {
  if (priorPngLoader) assetRequire.extensions['.png'] = priorPngLoader
  else delete assetRequire.extensions['.png']
})

const scenario = vi.hoisted(() => ({
  playing: false, focused: true, interacting: false,
  historySupported: true, historyItems: [] as { id: string; title: string }[],
  query: vi.fn(), history: vi.fn(), play: vi.fn(), refetch: vi.fn(),
  refresh: undefined as undefined | (() => unknown),
  state: { source: undefined as undefined | { kind: string; label: string }, current: undefined as undefined | { trackId: string; title: string; artwork?: { url: string; headers?: Record<string, string> } } },
  appListener: undefined as undefined | ((state: string) => void),
  motionListener: undefined as undefined | ((enabled: boolean) => void),
  push: vi.fn(), tap: vi.fn(), start: vi.fn(), toast: vi.fn(), repeat: vi.fn(), cancel: vi.fn(),
}))
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable',
  RefreshControl: 'RefreshControl', Text: 'Text', View: 'View', Platform: { OS: 'ios' },
  StyleSheet: { create: (v: unknown) => v, hairlineWidth: 1, absoluteFill: {} },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  AppState: { currentState: 'active', addEventListener: (_: string, listener: typeof scenario.appListener) => {
    scenario.appListener = listener; return { remove: () => { scenario.appListener = undefined } }
  } },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: (_: string, listener: typeof scenario.motionListener) => {
      scenario.motionListener = listener; return { remove: () => { scenario.motionListener = undefined } }
    },
  },
}))
vi.mock('react-native-reanimated', async () => {
  const { useEffect, useRef } = await import('react')
  return {
    default: { View: 'AnimatedView', ScrollView: 'ScrollView' },
    Easing: { linear: 'linear' },
    useSharedValue: (value: unknown) => useRef({ value }).current,
    useAnimatedStyle: () => ({}),
    useAnimatedReaction: (prepare: () => boolean, react: (v: boolean, previous: boolean | null) => void) => {
      const previous = useRef<boolean | null>(null)
      useEffect(() => { const value = prepare(); react(value, previous.current); previous.current = value })
    },
    withTiming: (value: number) => value,
    withRepeat: (...args: unknown[]) => { scenario.repeat(...args); return args[0] },
    cancelAnimation: scenario.cancel,
  }
})
vi.mock('expo-router', () => ({ useRouter: () => ({ push: scenario.push }), useIsFocused: () => scenario.focused }))
vi.mock('react-native-track-player', () => ({ useIsPlaying: () => ({ playing: scenario.playing }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[]; enabled: boolean }) => {
    scenario.query(options)
    return { data: { items: options.queryKey[0] === 'history' ? scenario.historyItems : options.queryKey[1] === 'playlists' ? [{ id: 'list' }] : [] }, isEnabled: options.enabled, isError: false }
  },
  useQueryClient: () => ({ refetchQueries: scenario.refetch }),
}))
vi.mock('../../src/components/icon', () => ({ Icon: 'Icon', iconSize: { sm: 16, md: 20, lg: 24 } }))
vi.mock('../../src/components/collapsible-tab-header', () => ({
  CollapsibleHeaderBar: ({ rightElement }: { rightElement: React.ReactNode }) => rightElement,
  LargeTitleHeader: 'LargeTitleHeader',
}))
vi.mock('../../src/components/home-pull-refresh', () => ({ HomePullRefreshIndicator: 'Indicator', useHomePullRefresh: ({ onRefresh }: { onRefresh: () => unknown }) => { scenario.refresh = onRefresh; return {} } }))
vi.mock('../../src/components/list-states', () => ({ ErrorState: 'ErrorState' }))
vi.mock('../../src/components/scan-monitor-button', () => ({ ScanMonitorButton: 'ScanMonitorButton' }))
vi.mock('../../src/components/toast', () => ({ useToast: () => scenario.toast }))
vi.mock('../../src/lib/bottom-space', () => ({ useBottomSpace: () => 100 }))
vi.mock('../../src/lib/haptics', () => ({ tap: scenario.tap }))
vi.mock('../../src/lib/menu-guard', () => ({ isGlobalMenuInteracting: () => scenario.interacting, useIsMenuOpen: () => false }))
vi.mock('../../src/lib/server-session', () => ({ useServerSession: () => ({ provider: { capabilities: { playlists: 'read', playHistory: scenario.historySupported }, history: scenario.history }, connection: { id: 'server' } }) }))
vi.mock('../../src/lib/local-radio', () => ({ startHomeRadio: scenario.start }))
vi.mock('../../src/player/controller', () => ({ playTrackList: scenario.play }))
vi.mock('../../src/player/store', () => ({
  selectCurrent: (state: typeof scenario.state) => state.current,
  usePlayerStore: (select: (s: typeof scenario.state) => unknown) => select(scenario.state),
}))
vi.mock('../../src/theme/theme-provider', () => ({
  useAppTheme: () => ({ colors: {}, isDark: true }),
  useThemeColors: () => ({}), createThemedStyles: (factory: (colors: object) => unknown) => () => factory({}),
}))
vi.mock('../../src/screens/home/AlbumShelf', () => ({ AlbumShelf: 'AlbumShelf' }))
vi.mock('../../src/screens/home/TurntableIllustration', () => ({ TurntableIllustration: 'TurntableIllustration', RoamingEqualizer: 'RoamingEqualizer' }))
vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }))
vi.mock('react-native-svg', () => ({ default: 'Svg', Defs: 'Defs', Ellipse: 'Ellipse', LinearGradient: 'LinearGradient', RadialGradient: 'RadialGradient', Rect: 'Rect', Stop: 'Stop' }))
vi.mock('../../src/screens/home/PagedTrackCarousel', () => ({ PagedTrackCarousel: 'PagedTrackCarousel' }))
vi.mock('../../src/screens/home/PlaylistShelf', () => ({ PlaylistShelf: 'PlaylistShelf' }))

import { HomeScreen } from '../../src/screens/home'
import { HeroStationCard } from '../../src/screens/home/HeroStationCard'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let renderer: ReactTestRenderer | undefined
const button = (name: string) => renderer!.root.findAllByType('Pressable' as never).find((node) => node.props.accessibilityLabel === name)!
const card = () => renderer!.root.findByType(HeroStationCard)
const roaming = () => { scenario.state = { source: { kind: 'radio', label: '随心漫游' }, current: { trackId: 'song', title: '当前曲目' } } }
async function mount() { await act(async () => { renderer = create(<HomeScreen />) }) }
async function update() { await act(async () => { renderer!.update(<HomeScreen />) }) }
beforeEach(() => {
  vi.clearAllMocks(); scenario.start.mockResolvedValue(undefined)
  scenario.play.mockResolvedValue(undefined); scenario.refetch.mockResolvedValue(undefined)
  scenario.historySupported = true; scenario.historyItems = []
  scenario.playing = false; scenario.focused = true; scenario.interacting = false
  scenario.state = { source: undefined, current: undefined }
})
afterEach(async () => { if (renderer) await act(async () => { renderer!.unmount() }); renderer = undefined })

describe('首页唱片抽屉行为', () => {
  it('starts once even if the same press callback fires twice before a render', async () => {
    let resolve!: () => void
    scenario.start.mockImplementation(() => new Promise<void>((r) => { resolve = r }))
    await mount()
    const press = button('开始随心漫游').props.onPress
    await act(async () => { press(); press() })
    expect(scenario.start).toHaveBeenCalledOnce()
    expect(button('正在开始随心漫游').props.disabled).toBe(true)
    await act(async () => { resolve() })
    expect(button('开始随心漫游').props.disabled).toBe(false)
  })
  it('keeps active roaming status-only without duplicate player navigation', async () => {
    roaming(); await mount()
    const status = renderer!.root.findByProps({ accessibilityLabel: '随心漫游，已开启' })
    expect(status.type).toBe('View')
    expect(status.props.onPress).toBeUndefined()
    expect(scenario.push).not.toHaveBeenCalled()
    expect(scenario.tap).not.toHaveBeenCalled()
    expect(status.props.accessibilityRole).toBe('text')
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('查看播放')
    expect(scenario.start).not.toHaveBeenCalled()
    expect(scenario.playing).toBe(false)
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('当前曲目')
  })
  it('shows the start state when selecting an ordinary track even if its source label contains 漫游', async () => {
    roaming(); await mount()
    scenario.state.source = { kind: 'playlist', label: '我的漫游歌单' }
    await update()
    expect(button('开始随心漫游')).toBeDefined()
  })
  it('keeps the illustration mounted while entering roaming so the tonearm can animate', async () => {
    await mount()
    const illustration = renderer!.root.findByType('TurntableIllustration' as never)
    expect(illustration.props.engaged).toBe(false)
    roaming(); scenario.playing = true; await update()
    expect(renderer!.root.findByType('TurntableIllustration' as never)).toBe(illustration)
    expect(illustration.props.engaged).toBe(true)
    expect(button('开始随心漫游')).toBeUndefined()
  })
  it('keeps current artwork during roaming pause and removes it when roaming ends', async () => {
    await mount()
    roaming()
    const artwork = { url: 'https://music.invalid/cover.jpg', headers: { Authorization: 'test-only' } }
    scenario.state.current!.artwork = artwork
    scenario.playing = true
    await update()
    const deck = renderer!.root.findByType('TurntableIllustration' as never)
    expect(deck.props.artwork).toBe(artwork)
    scenario.playing = false
    await update()
    expect(deck.props.artwork).toBe(artwork)
    scenario.state.source = undefined
    await update()
    expect(deck.props.artwork).toBeUndefined()
  })
  it('releases the start lock after failure and allows retry', async () => {
    scenario.start.mockRejectedValueOnce(new Error('连接失败'))
    await mount()
    await act(async () => { button('开始随心漫游').props.onPress() })
    expect(scenario.toast).toHaveBeenCalledWith('连接失败')
    await act(async () => { button('开始随心漫游').props.onPress() })
    expect(scenario.start).toHaveBeenCalledTimes(2)
  })
  it('ignores a settled start result after leaving the mounted screen', async () => {
    let resolve!: () => void
    scenario.start.mockImplementation(() => new Promise<void>((r) => { resolve = r }))
    await mount()
    await act(async () => { button('开始随心漫游').props.onPress(); renderer!.unmount() })
    renderer = undefined
    await act(async () => { resolve() })
    expect(scenario.toast).not.toHaveBeenCalled()
    expect(scenario.appListener).toBeUndefined()
    expect(scenario.motionListener).toBeUndefined()
  })
  it('keeps collection routes reachable and blocks all entry actions during menu interaction', async () => {
    await mount()
    for (const [label, path] of [['我喜欢的', '/home/favorites'], ['查看全部最近播放', '/home/history'], ['已下载', '/home/downloaded']]) {
      await act(async () => { button(label!).props.onPress() })
      expect(scenario.push).toHaveBeenLastCalledWith(path)
    }
    scenario.push.mockClear(); scenario.interacting = true
    await act(async () => {
      for (const label of ['我喜欢的', '查看全部最近播放', '已下载', '开始随心漫游']) button(label).props.onPress()
    })
    expect(scenario.push).not.toHaveBeenCalled(); expect(scenario.start).not.toHaveBeenCalled()
  })
  it('shows history before collections and new content, and plays the selected history queue', async () => {
    scenario.historyItems = [{ id: 'first', title: '第一首' }, { id: 'second', title: '第二首' }]
    await mount()
    const sections = renderer!.root.findAll((node) => ['PagedTrackCarousel', 'PlaylistShelf', 'AlbumShelf'].includes(node.type as string))
    expect(sections.map((node) => node.props.title ?? '歌单')).toEqual(['最近播放', '歌单', '最近添加歌曲', '最近添加专辑', '岁月拾遗'])
    const history = sections[0]!
    expect(history.props.seeAllHref).toBe('/home/history')
    await act(async () => { history.props.onPlayTrack(scenario.historyItems[1], 1) })
    expect(scenario.play).toHaveBeenCalledWith(expect.objectContaining({ tracks: scenario.historyItems, startIndex: 1, source: { kind: 'history', label: '最近播放' } }))
    scenario.play.mockClear(); scenario.interacting = true
    await act(async () => { history.props.onPlayTrack(scenario.historyItems[0], 0) })
    expect(scenario.play).not.toHaveBeenCalled()
  })
  it('shares the playback invalidation prefix and refreshes history with the homepage', async () => {
    await mount()
    const query = scenario.query.mock.calls.map(([options]) => options).find((options) => options.queryKey[0] === 'history')
    expect(query.queryKey).toEqual(['history', 'server', 'home'])
    query.queryFn()
    expect(scenario.history).toHaveBeenCalledWith({ page: 1, size: 9 })
    await act(async () => { await scenario.refresh?.() })
    expect(scenario.refetch).toHaveBeenCalledWith({ queryKey: ['home'] })
    expect(scenario.refetch).toHaveBeenCalledWith({ queryKey: ['history', 'server', 'home'], exact: true })
  })
  it('omits history for providers without play-history support', async () => {
    scenario.historySupported = false
    await mount()
    expect(button('查看全部最近播放')).toBeUndefined()
    const query = scenario.query.mock.calls.map(([options]) => options).find((options) => options.queryKey[0] === 'history')
    expect(query.enabled).toBe(false)
  })
  it('animates only while playing; pausing preserves roaming mode', async () => {
    roaming(); scenario.playing = true; await mount()
    expect(scenario.repeat).toHaveBeenCalled()
    scenario.repeat.mockClear(); scenario.cancel.mockClear(); scenario.playing = false
    await update()
    expect(scenario.cancel).toHaveBeenCalled(); expect(scenario.repeat).not.toHaveBeenCalled()
    expect(JSON.stringify(renderer!.toJSON())).toContain('已暂停')
    const deck = renderer!.root.findByType('TurntableIllustration' as never)
    expect(deck.props.engaged).toBe(true)
    expect(deck.props.emitting).toBe(false)
    expect(renderer!.root.findByProps({ accessibilityLabel: '随心漫游，已开启' }).props.accessibilityRole).toBe('text')
  })
  it('stops outside the viewport, on blur, background, and reduced motion; resumes when eligible', async () => {
    roaming(); scenario.playing = true; await mount()
    const stop = async (change: () => void) => {
      scenario.repeat.mockClear(); scenario.cancel.mockClear()
      await act(async () => { change() }); await update()
      expect(scenario.cancel).toHaveBeenCalled(); expect(scenario.repeat).not.toHaveBeenCalled()
    }
    const resume = async (change: () => void) => {
      scenario.repeat.mockClear(); await act(async () => { change() }); await update()
      expect(scenario.repeat).toHaveBeenCalled()
    }
    await stop(() => { card().props.scrollY.value = 600 })
    await resume(() => { card().props.scrollY.value = 0 })
    await stop(() => { scenario.focused = false })
    await resume(() => { scenario.focused = true })
    await stop(() => { scenario.appListener?.('background') })
    await resume(() => { scenario.appListener?.('active') })
    await stop(() => { scenario.motionListener?.(true) })
    await resume(() => { scenario.motionListener?.(false) })
  })
})
