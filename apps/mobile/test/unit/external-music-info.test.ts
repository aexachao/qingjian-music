import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue(null), setItemAsync: vi.fn().mockResolvedValue(undefined) }))
import { useExternalSourcesStore, type SourceService } from '@/lib/external-source'
import {
  fetchCanonicalAlbumTracks,
  fetchCanonicalArtistAlbumPage,
  getMusicInfoSourceRef,
} from '@/lib/external-music-info'

const netease: SourceService = {
  id: 'music-info',
  type: 'netease',
  baseUrl: 'https://music.example/api',
  token: '',
  useLyrics: true,
  useMusicInfo: true,
}

function setServices(services: SourceService[], revision = 1): void {
  useExternalSourcesStore.setState({ services, revision })
}

function reply(data: unknown): Response {
  return { ok: true, json: async () => data } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  setServices([])
})

describe('external music catalog adapter', () => {
  it('ignores lyric-only services when choosing the music information source', () => {
    setServices([{ ...netease, id: 'lyrics', type: 'lrcapi', useMusicInfo: true }])
    expect(getMusicInfoSourceRef()).toBeUndefined()
  })

  it('rejects HTTP-200 provider error codes and malformed catalog payloads as errors', async () => {
    setServices([netease])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 500, result: { artists: [] } })))
    await expect(fetchCanonicalArtistAlbumPage('刘德华')).resolves.toEqual({ status: 'error' })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 200, result: { artists: 'not-an-array' } })))
    await expect(fetchCanonicalArtistAlbumPage('刘德华')).resolves.toEqual({ status: 'error' })
  })

  it('refuses multiple exact artist identities instead of choosing the first', async () => {
    setServices([netease])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({
      code: 200,
      result: { artists: [{ id: 1, name: '刘德华' }, { id: 2, name: '刘德华' }] },
    })))
    await expect(fetchCanonicalArtistAlbumPage('刘德华')).resolves.toEqual({ status: 'ambiguous' })
  })

  it('honors more=false even when the provider count and page size suggest more data', async () => {
    setServices([netease])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ code: 200, result: { artists: [{ id: 3691, name: '刘德华' }] } }))
      .mockResolvedValueOnce(reply({
        code: 200,
        artist: { id: 3691, albumSize: 149 },
        more: false,
        hotAlbums: [{ id: 11014, name: '5时30分', type: '专辑', subType: '录音室版', size: 10, artist: { id: 3691, name: '刘德华' } }],
      }))
    vi.stubGlobal('fetch', fetchMock)
    const page = await fetchCanonicalArtistAlbumPage('刘德华')
    expect(page.status).toBe('ok')
    if (page.status !== 'ok') return
    expect(page.items[0]).toMatchObject({ externalId: '11014', name: '5时30分', edition: '录音室版' })
    expect(page.nextCursor).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('binds cursors to artist and source, and treats an empty more=true page as an error', async () => {
    setServices([netease])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ code: 200, result: { artists: [{ id: 3691, name: '刘德华' }] } }))
      .mockResolvedValueOnce(reply({ code: 200, artist: { id: 3691 }, more: true, hotAlbums: [{ id: 1, name: '专辑' }] }))
      .mockResolvedValueOnce(reply({ code: 200, artist: { id: 3691 }, more: true, hotAlbums: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const first = await fetchCanonicalArtistAlbumPage('刘德华')
    expect(first.status).toBe('ok')
    if (first.status !== 'ok' || !first.nextCursor) throw new Error('expected a next cursor')
    await expect(fetchCanonicalArtistAlbumPage('张学友', first.nextCursor)).resolves.toEqual({ status: 'source-changed' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await expect(fetchCanonicalArtistAlbumPage('刘德华', first.nextCursor)).resolves.toMatchObject({ status: 'error' })
  })

  it('rejects a result if the selected source changes while artist search is pending', async () => {
    setServices([netease])
    const fetchMock = vi.fn().mockImplementation(async () => {
      setServices([{ ...netease, useMusicInfo: false }], 2)
      return reply({ code: 200, result: { artists: [{ id: 3691, name: '刘德华' }] } })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchCanonicalArtistAlbumPage('刘德华')).resolves.toEqual({ status: 'source-changed' })
  })

  it('uses exact artist-and-album resolution when no catalog album ID is available', async () => {
    setServices([netease])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ code: 200, result: { artists: [{ id: 3691, name: '刘德华' }] } }))
      .mockResolvedValueOnce(reply({ code: 200, result: { albums: [{ id: 11014, name: '5时30分', artists: [{ id: 3691, name: '刘德华' }] }] } }))
      .mockResolvedValueOnce(reply({
        code: 200,
        album: { id: 11014, name: '5时30分', artists: [{ id: 3691, name: '刘德华' }] },
        songs: [{ id: 1, name: '花花世界', no: 1, cd: '1' }, { id: 2, name: '缘份', no: 10, cd: '1' }],
      }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchCanonicalAlbumTracks('刘德华', '5时30分')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.items).toEqual([
      { title: '花花世界', externalId: '1', trackNo: 1, discNo: 1 },
      { title: '缘份', externalId: '2', trackNo: 10, discNo: 1 },
    ])
  })

  it('does not pick among duplicate exact album matches', async () => {
    setServices([netease])
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(reply({ code: 200, result: { artists: [{ id: 3691, name: '刘德华' }] } }))
      .mockResolvedValueOnce(reply({ code: 200, result: { albums: [
        { id: 11014, name: '5时30分', artists: [{ id: 3691, name: '刘德华' }] },
        { id: 11015, name: '5时30分', artists: [{ id: 3691, name: '刘德华' }] },
      ] } })))
    await expect(fetchCanonicalAlbumTracks('刘德华', '5时30分')).resolves.toMatchObject({ status: 'ambiguous' })
  })

  it('rejects a catalog ID whose returned album belongs to another artist', async () => {
    setServices([netease])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({
      code: 200,
      album: { id: 11014, name: '5时30分', artist: { id: 2, name: '其他歌手' } },
      songs: [{ id: 1, name: '误配曲目', no: 1, cd: '1' }],
    })))
    await expect(fetchCanonicalAlbumTracks('刘德华', '5时30分', '11014')).resolves.toMatchObject({ status: 'ambiguous' })
  })
})
