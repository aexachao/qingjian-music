import { describe, expect, it } from 'vitest'
import type { Capabilities } from '@qj/core-domain'
import { NO_CAPABILITIES } from '@qj/core-domain'
import { FNOS_CAPABILITIES, FnosProvider } from '../../src/provider'
import type { MusicProvider } from '@qj/provider-api'

describe('能力声明与实现一致性', () => {
  /** 根据 capabilities 推断「应该存在」的可选方法集合 */
  function expectedOptionalMethods(cap: Capabilities): Set<keyof MusicProvider> {
    const set = new Set<keyof MusicProvider>()
    if (cap.favorites) set.add('setFavorite')
    if (cap.playlists === 'write') {
      set.add('createPlaylist')
      set.add('editPlaylist')
      set.add('deletePlaylist')
      set.add('addTracksToPlaylist')
      set.add('removeTracksFromPlaylist')
    }
    // 有歌单概念就该能搜歌单（一期 D3）
    if (cap.playlists !== 'none') set.add('searchPlaylists')
    if (cap.playHistory) set.add('reportPlayback')
    if (cap.lyrics !== 'none') set.add('lyrics')
    if (cap.lyricOffsetWriteback) set.add('setLyricOffset')
    if (cap.radio) {
      set.add('radioStart')
      set.add('radioNext')
      set.add('radioPrevious')
    }
    // stream 是必填方法，不放在 optional 检查里
    if (cap.searchSuggest) set.add('suggest')
    if (cap.genres) set.add('genres')
    // `ratings` / `multiLibrary` 已在 FNOS_CAPABILITIES 里如实声明为 **false** ——
    // 契约层没有对应方法、UI 也零消费方。声明 false 本身就是「四层一致」的正确形态，
    // 所以这里不该为它们补方法断言（那会反过来逼出一个没人用的实现）。
    if (cap.audioSpec) set.add('audioSpec')
    return set
  }

  function makeProvider(): FnosProvider {
    return new FnosProvider(
      { id: 'test', providerId: 'fnos', displayName: 'Test', baseUrl: 'http://localhost', username: 'test' },
      { sha256Hex: async (s) => s, timeoutMs: 5000, deviceId: 'test' },
    )
  }

  it('飞牛 capabilities 为真的每一项，对应可选方法必须已实现', () => {
    const provider = makeProvider()
    const expected = expectedOptionalMethods(FNOS_CAPABILITIES)
    for (const key of expected) {
      expect(provider[key], `capabilities 声明 ${String(key)} 为 true，但实现缺失`).toBeDefined()
    }
  })

  it('NO_CAPABILITIES（全关）时，所有可选方法必须不存在', () => {
    const expected = expectedOptionalMethods(NO_CAPABILITIES)
    expect(expected.size).toBe(0)
  })

  it('FNOS_CAPABILITIES 包含 audioSpec（一期新增）', () => {
    expect(FNOS_CAPABILITIES.audioSpec).toBe(true)
  })

  it('playlists 为 write 时，读写方法必须全部存在', () => {
    expect(FNOS_CAPABILITIES.playlists).toBe('write')
    const provider = makeProvider()
    expect(provider.createPlaylist).toBeDefined()
    expect(provider.editPlaylist).toBeDefined()
    expect(provider.deletePlaylist).toBeDefined()
    expect(provider.addTracksToPlaylist).toBeDefined()
    expect(provider.removeTracksFromPlaylist).toBeDefined()
  })

  it('飞牛声明不支持码率档位（服务端忽略 bitrate，转码恒输出无损 FLAC）', () => {
    // 这条为 false 是「音质」设置页与播放侧同时收起该功能的依据，
    // 别因为「飞牛也能转码」就误以为它能按码率输出 —— 它只有一档。
    expect(FNOS_CAPABILITIES.qualityTiers).toBe(false)
  })

  it('NO_CAPABILITIES 默认也不支持码率档位（保守默认，新后端必须显式声明）', () => {
    expect(NO_CAPABILITIES.qualityTiers).toBe(false)
  })
})
