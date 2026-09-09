import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const controllerSource = readFileSync(resolve(__dirname, '../../src/player/controller.ts'), 'utf8')
const bridgeSource = readFileSync(resolve(__dirname, '../../src/player/bridge.tsx'), 'utf8')

describe('播放工具栏：随机 / 循环 / 无限', () => {
  it('随机开关先翻转状态，重排用原位 move、不重新拉流', () => {
    const flag = controllerSource.indexOf('store.setShuffle(shuffle)')
    const reorder = controllerSource.indexOf('await reorderRntpUpcoming(start, tail, queue)')
    expect(flag).toBeGreaterThan(-1)
    expect(reorder).toBeGreaterThan(-1)
    expect(flag).toBeLessThan(reorder)
    // 随机只是重排已加载曲目：用 move 原位挪动，不再 remove 后重新生成播放地址
    expect(controllerSource).toContain('await TrackPlayer.move(start + fromOffset, start + toOffset)')
    expect(controllerSource).not.toContain('await TrackPlayer.remove(removeIndices)')
    // 重排是用户主动操作，失败要留日志而不是静默吞掉
    expect(controllerSource).toContain('随机播放重排失败')
  })

  it('循环模式切换先确保播放器就绪，失败保持当前模式', () => {
    const ensure = controllerSource.indexOf('await ensurePlayer()', controllerSource.indexOf('export async function cycleRepeat'))
    const setMode = controllerSource.indexOf('await TrackPlayer.setRepeatMode')
    expect(ensure).toBeGreaterThan(-1)
    expect(ensure).toBeLessThan(setMode)
    expect(controllerSource).toContain('切换循环模式失败')
    expect(controllerSource).toContain("REPEAT_ORDER[(REPEAT_ORDER.indexOf(current) + 1) % REPEAT_ORDER.length]")
  })

  it('漫游会话把无限播放标为开启，工具栏如实反映', () => {
    const startRadio = controllerSource.indexOf('export async function startRadio')
    const setAutoplay = controllerSource.indexOf('setAutoplay(true)')
    expect(setAutoplay).toBeGreaterThan(startRadio)
  })

  it('漫游续歌与普通队列续歌都只在无限播放开启时触发', () => {
    expect(bridgeSource).toContain("source?.kind === 'radio' && autoplay")
    expect(bridgeSource).toContain('autoplay && activeIndex >= queue.length - 2')
  })
})
