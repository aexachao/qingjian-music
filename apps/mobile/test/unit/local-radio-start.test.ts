import { beforeEach, expect, it, vi } from 'vitest'
import { emptyProfile, MusicError, type Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'

const calls = vi.hoisted(() => ({ play: vi.fn(), radio: vi.fn(), profile: vi.fn() }))
vi.mock('../../src/player/controller', () => ({ playTrackList: calls.play, startRadio: calls.radio }))
vi.mock('../../src/player/store', () => ({ usePlayerStore: { getState: () => ({ history: [] }) } }))
vi.mock('../../src/lib/taste-profile-store', () => ({ useTasteProfileStore: { getState: () => ({ profileOf: calls.profile }) } }))
import { startHomeRadio } from '../../src/lib/local-radio'

const song: Track = { id: 'track', title: 'song', artists: [], genres: [], isCue: false, durationMs: 1000 }
function provider(items: Track[] = [song]) {
  return { tracks: vi.fn().mockResolvedValue({ items, total: items.length }), radioStart: vi.fn() } as unknown as MusicProvider
}
beforeEach(() => {
  calls.play.mockReset().mockResolvedValue(undefined)
  calls.radio.mockReset().mockResolvedValue(undefined)
  calls.profile.mockReset().mockReturnValue(emptyProfile())
})
it('starts with no history, no taste events, and no prior manually played track', async () => {
  await startHomeRadio(provider(), 'server')
  expect(calls.play).toHaveBeenCalledWith(expect.objectContaining({ tracks: [song], serverId: 'server' }))
  expect(calls.radio).not.toHaveBeenCalled()
})
it('falls back once when the local candidate pool is empty', async () => {
  calls.radio.mockRejectedValue(new MusicError({ code: 'notFound', message: 'empty' }))
  await expect(startHomeRadio(provider([]), 'server')).rejects.toThrow('没有找到可播放的歌曲')
  expect(calls.radio).toHaveBeenCalledTimes(1)
  expect(calls.play).not.toHaveBeenCalled()
})
it('keeps both selection and server failure categories without leaking raw payloads', async () => {
  const p = provider()
  vi.mocked(p.tracks).mockRejectedValue(new MusicError({ code: 'timeout', message: 'https://secret.example/?token=secret' }))
  calls.radio.mockRejectedValue(new MusicError({ code: 'protocol', message: 'secret payload' }))
  await expect(startHomeRadio(p, 'server')).rejects.toThrow('选曲：请求超时；服务器漫游：服务器返回的数据无法识别')
  expect(calls.radio).toHaveBeenCalledTimes(1)
})
it('does not replace a selected queue with server radio after a playback failure', async () => {
  calls.play.mockRejectedValue(new MusicError({ code: 'network', message: 'failed' }))
  await expect(startHomeRadio(provider(), 'server')).rejects.toThrow('漫游播放失败：网络连接失败')
  expect(calls.radio).not.toHaveBeenCalled()
})
it('does not falsely report success when radio is unsupported and the library is empty', async () => {
  const p = provider([])
  delete p.radioStart
  await expect(startHomeRadio(p, 'server')).rejects.toThrow('曲库中没有可供漫游的歌曲')
  expect(calls.radio).not.toHaveBeenCalled()
})
it('retains an explicit network-policy explanation instead of falling back to another request', async () => {
  const error = new Error('已开启“仅 Wi-Fi 联网”，可在设置中关闭；已下载的歌曲仍可播放')
  error.name = 'PlaybackNetworkBlocked'
  calls.play.mockRejectedValue(error)
  await expect(startHomeRadio(provider(), 'server')).rejects.toThrow('仅 Wi-Fi 联网')
  expect(calls.radio).not.toHaveBeenCalled()
})
