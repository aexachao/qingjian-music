import { describe, expect, it } from 'vitest'
import { readSource } from '../support/source'

const controllerSource = readSource('player/controller.ts')
const bridgeSource = readSource('player/bridge.tsx')

describe('播放工具栏：随机 / 循环 / 无限', () => {
  // Shuffle/repeat ordering and failure behavior are exercised in player-controller.test.ts.

  it('漫游会话把无限播放标为开启，工具栏如实反映', () => {
    const startRadio = controllerSource.indexOf('export async function startRadio')
    const setAutoplay = controllerSource.indexOf('setAutoplay(true)')
    expect(setAutoplay).toBeGreaterThan(startRadio)
  })

  it('漫游续歌与普通队列续歌都只在无限播放开启时触发', () => {
    expect(bridgeSource).toContain("source?.kind === 'radio' && autoplay")
    // 队列近尾用 nearEnd 变量（= activeIndex >= queue.length - 2）；
    // 列表真末尾 + ♾️ → 漫游续命
    expect(bridgeSource).toContain('activeIndex >= queue.length - 2')
    expect(bridgeSource).toContain('autoplay && nearEnd')
  })

  it('续歌优先补列表下页（不看♾️），列表真末尾后才漫游', () => {
    // 列表还有下页：无论♾️开没开都先补列表
    expect(bridgeSource).toContain('nearEnd && hasPendingListFeed()')
    expect(bridgeSource).toContain('fillFromListFeed')
  })

  it('歌词图标使用 1:1 Apple 风格的实心反白双引号气泡 SVG 绘制', () => {
    const iconSource = readSource('components/icon.tsx')
    expect(iconSource).toContain("name === 'lyrics'")
    expect(iconSource).toContain('fillRule="evenodd"')
    expect(iconSource).toContain('viewBox="0 0 24 24"')
  })
})
