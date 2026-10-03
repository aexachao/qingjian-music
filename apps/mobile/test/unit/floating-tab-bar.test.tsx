import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const events = vi.hoisted(() => ({ emit: vi.fn(), navigate: vi.fn() }))
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' }, Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, hairlineWidth: 1 },
}))
vi.mock('../../src/components/icon', () => ({ Icon: 'Icon' }))
vi.mock('../../src/lib/bottom-space', () => ({ TAB_BAR_HEIGHT: 64 }))
vi.mock('../../src/theme/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'dark', colors: {} }),
  createThemedStyles: (factory: (c: object) => object) => () => factory({}),
}))
import { FloatingTabBar } from '../../src/components/floating-tab-bar'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let renderer: ReactTestRenderer | undefined
const routes = ['home', 'search', 'library', 'settings'].map((name) => ({ key: name, name }))
const labels = ['首页', '搜索', '音乐库', '设置']
const descriptors = Object.fromEntries(routes.map((route, index) => [route.key, { options: { title: labels[index] } }]))
async function mount(hidden = false) {
  await act(async () => {
    renderer = create(<FloatingTabBar hidden={hidden} state={{ index: 0, routes }} descriptors={descriptors} navigation={events} insets={{ bottom: 34 }} />)
  })
}
beforeEach(() => { vi.clearAllMocks(); events.emit.mockReturnValue({ defaultPrevented: false }) })
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined })
const tabs = () => renderer!.root.findAllByType('Pressable' as never)

describe('贴底页签保持导航契约', () => {
  it('exposes four labeled tabs with one selected destination', async () => {
    await mount()
    expect(tabs().map((tab) => tab.props.accessibilityLabel)).toEqual(labels)
    expect(tabs().map((tab) => tab.props.accessibilityState.selected)).toEqual([true, false, false, false])
  })
  it('emits tabPress before navigation and preserves prevention', async () => {
    await mount()
    await act(async () => tabs()[1]!.props.onPress())
    expect(events.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'search', canPreventDefault: true })
    expect(events.navigate).toHaveBeenCalledWith('search', undefined)
    events.navigate.mockClear(); events.emit.mockReturnValue({ defaultPrevented: true })
    await act(async () => tabs()[2]!.props.onPress())
    expect(events.navigate).not.toHaveBeenCalled()
  })
  it('repeated selection still emits tabPress without resetting the route', async () => {
    await mount()
    await act(async () => tabs()[0]!.props.onPress())
    expect(events.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'home', canPreventDefault: true })
    expect(events.navigate).not.toHaveBeenCalled()
    await act(async () => tabs()[0]!.props.onLongPress())
    expect(events.emit).toHaveBeenLastCalledWith({ type: 'tabLongPress', target: 'home' })
  })
  it('removes all tab hit targets in the immersive search state', async () => {
    await mount(true)
    expect(renderer!.toJSON()).toBeNull()
    expect(events.navigate).not.toHaveBeenCalled()
  })
})
