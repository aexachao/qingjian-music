import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasCode, hasNoCode } from '../support/source'

/**
 * 音质档位：**能力门控 + 入口已撤**。
 *
 * 背景：当前唯一的后端（飞牛）只有一档输出 —— 服务端忽略转码的 `output.bitrate`、
 * 恒输出无损 FLAC（实测见 `docs/fnos-transcode.md` 的「实测校正」）。所以在那台服务器上
 * 选「标准音质」既省不了流量，又会让**每一首歌**都被判定为需要转码 —— 拿一个不存在的收益
 * 去换整条播放链路的稳定性。
 *
 * 2026-09-16 的决定：**把设置里的音质入口撤掉**（连同设置页那一行与整个设置屏），
 * 管线保留（偏好项 + 按能力选择音质），等真有支持码率档位的后端（Emby / Jellyfin 那类）
 * 再把 UI 放回来。这里同时钉住两件事：入口真的没了、播放侧的 gating 还在。
 */
describe('音质：入口已撤，但播放侧仍按能力门控', () => {
  it('设置页不再有音质入口（不摆「看起来能选、其实不生效」的假开关）', () => {
    expect(hasNoCode('screens/settings.tsx', '音质')).toBe(true)
    expect(hasNoCode('screens/settings.tsx', 'audio-quality')).toBe(true)
  })

  it('音质设置屏与它的路由都不在了', () => {
    const root = resolve(__dirname, '../..')
    expect(existsSync(resolve(root, 'src/screens/audio-quality-settings.tsx'))).toBe(false)
    expect(existsSync(resolve(root, 'src/app/(tabs)/settings/audio-quality.tsx'))).toBe(false)
  })

  it('播放侧仍把 capabilities 传给 selectPlaybackQuality，不允许绕过', () => {
    expect(
      hasCode(
        'player/controller.ts',
        'selectPlaybackQuality(networkType, { wifiQuality, cellularQuality }, supportsQualityTiers)',
      ),
    ).toBe(true)
    expect(hasCode('player/controller.ts', 'activeProvider?.capabilities.qualityTiers ?? false')).toBe(true)
  })

  it('管线本身保留（免得下次要放回 UI 时发现被删干净了）', () => {
    const prefs = 'lib/audio-quality-preferences.ts'
    expect(hasCode(prefs, 'wifiQuality')).toBe(true)
    expect(hasCode(prefs, 'cellularQuality')).toBe(true)
    expect(hasCode('lib/playback-quality.ts', 'if (!supportsQualityTiers) return \'original\'')).toBe(true)
  })
})
