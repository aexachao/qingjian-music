import { describe, expect, it } from 'vitest'
import { hasCode } from '../support/source'

/**
 * 音质档位的能力门控契约。
 *
 * 背景：飞牛的服务端**忽略** transcode 的 output.bitrate，转码恒输出无损 FLAC
 * （见 `docs/fnos-transcode.md` 的实测校正）。也就是说在这台服务器上选「标准音质」
 * 既省不了流量，又会让**每一首歌**都被判定为需要转码 —— 拿一个不存在的收益
 * 去换整条播放链路的稳定性。
 *
 * 所以这件事必须在三层同时成立，缺一层就会出现「UI 能选、实际不生效、还把播放搞脆」：
 *   1. 能力声明（core-domain / provider-fnos 的单测覆盖）
 *   2. 播放侧按能力决定音质，不据偏好强制转码  ← 这里
 *   3. UI 入口按能力决定是否提供选项          ← 这里
 */
describe('音质档位能力门控', () => {
  it('播放侧把 capabilities 传给 selectPlaybackQuality，不允许绕过', () => {
    expect(
      hasCode(
        'player/controller.ts',
        'selectPlaybackQuality(networkType, { wifiQuality, cellularQuality }, supportsQualityTiers)',
      ),
    ).toBe(true)
  })

  it('播放侧的能力取值来自 provider.capabilities.qualityTiers', () => {
    expect(hasCode('player/controller.ts', 'activeProvider?.capabilities.qualityTiers ?? false')).toBe(true)
  })

  it('音质设置页按能力决定是否提供选项，不支持时给说明而不是假选项', () => {
    expect(hasCode('screens/audio-quality-settings.tsx', 'provider?.capabilities.qualityTiers')).toBe(true)
    // 不支持时必须走说明分支，而不是仍然渲染可点的选项行
    expect(hasCode('screens/audio-quality-settings.tsx', '当前服务器只有一档音质')).toBe(true)
  })

  it('设置页的音质当前值也如实反映后端能力', () => {
    expect(hasCode('screens/settings.tsx', 'provider?.capabilities.qualityTiers === false')).toBe(true)
  })
})
