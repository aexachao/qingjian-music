/**
 * 契约测试：对着真实的飞牛音乐服务器跑，用来发现 fnOS 升级带来的接口漂移。
 *
 * 需要环境变量（不要写进仓库）：
 *   FNOS_BASE_URL=http://192.168.2.100:5666 FNOS_USERNAME=xxx FNOS_PASSWORD=xxx pnpm test:contract
 * 未设置时整组自动跳过，CI 上不会因为连不上 NAS 而失败。
 */
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ProviderSession, ServerConnection } from '@qj/provider-api'
import { FnosProvider } from '../../src/provider'

const baseUrl = process.env['FNOS_BASE_URL']
const username = process.env['FNOS_USERNAME']
const password = process.env['FNOS_PASSWORD']
const configured = Boolean(baseUrl && username && password)

const connection: ServerConnection = {
  id: 'contract',
  providerId: 'fnos',
  displayName: '契约测试服务器',
  baseUrl: baseUrl ?? 'http://127.0.0.1',
  username: username ?? '',
}

const sha256Hex = async (input: string) => createHash('sha256').update(input).digest('hex')

describe.skipIf(!configured)('飞牛音乐契约测试', () => {
  let provider: FnosProvider
  let session: ProviderSession
  let sampleTrackId: string
  let sampleAlbumId: string
  let sampleArtistId: string

  beforeAll(async () => {
    provider = new FnosProvider(connection, { sha256Hex, deviceId: 'qj-contract-test', timeoutMs: 30_000 })
    session = await provider.login({ password: password! })
    const tracks = await provider.tracks({ page: 1, size: 1 })
    const track = tracks.items[0]
    if (!track) throw new Error('曲库为空，无法跑契约测试')
    sampleTrackId = track.id
    sampleAlbumId = track.album?.id ?? ''
    sampleArtistId = track.artists[0]?.id ?? ''
  }, 60_000)

  it('登录返回 token 与用户信息', () => {
    expect(session.token).toMatch(/.{16,}/)
    expect(session.user.name).toBe(username)
  })

  it('/user/me 与登录用户一致', async () => {
    const user = await provider.currentUser()
    expect(user.id).toBe(session.user.id)
  })

  it('曲目分页可用且 total 有意义', async () => {
    const page = await provider.tracks({ page: 1, size: 5 })
    expect(page.items).toHaveLength(5)
    expect(page.total).toBeGreaterThan(5)
    expect(page.hasMore).toBe(true)
    expect(page.items[0]?.durationMs).toBeGreaterThan(0)
  })

  it('第二页与第一页内容不同（page 参数真的生效）', async () => {
    const [first, second] = await Promise.all([
      provider.tracks({ page: 1, size: 3, sort: { field: 'title', order: 'asc' } }),
      provider.tracks({ page: 2, size: 3, sort: { field: 'title', order: 'asc' } }),
    ])
    expect(first.items.map((t) => t.id)).not.toEqual(second.items.map((t) => t.id))
  })

  it('专辑列表与专辑详情、专辑内曲目', async () => {
    const albums = await provider.albums({ page: 1, size: 5, sort: { field: 'createdAt', order: 'desc' } })
    expect(albums.items.length).toBeGreaterThan(0)
    expect(albums.total).toBeGreaterThan(0)

    if (sampleAlbumId) {
      const album = await provider.album(sampleAlbumId)
      expect(album.id).toBe(sampleAlbumId)
      const tracks = await provider.albumTracks(sampleAlbumId, { page: 1, size: 50 })
      expect(tracks.items.length).toBeGreaterThan(0)
      expect(tracks.items.every((t) => t.title.length > 0)).toBe(true)
    }
  })

  it('艺术家列表、艺术家专辑与艺术家曲目', async () => {
    const artists = await provider.artists({ page: 1, size: 5 })
    expect(artists.items.length).toBeGreaterThan(0)

    if (sampleArtistId) {
      const [albums, tracks] = await Promise.all([
        provider.artistAlbums(sampleArtistId, { page: 1, size: 5 }),
        provider.artistTracks(sampleArtistId, { page: 1, size: 5 }),
      ])
      expect(albums.items.length).toBeGreaterThan(0)
      expect(tracks.items.length).toBeGreaterThan(0)
    }
  })

  it('流派列表与流派内曲目', async () => {
    const genres = await provider.genres({ page: 1, size: 5 })
    expect(genres.items.length).toBeGreaterThan(0)
    const genreId = genres.items[0]?.id
    expect(genreId).toBeTruthy()
    const tracks = await provider.genreTracks(genreId!, { page: 1, size: 5 })
    expect(tracks.items.length).toBeGreaterThan(0)
  })

  it('歌单、收藏、播放历史列表结构正确（可能为空）', async () => {
    const [playlists, favorites, history] = await Promise.all([
      provider.playlists({ page: 1, size: 5 }),
      provider.favorites({ page: 1, size: 5 }),
      provider.history({ page: 1, size: 5 }),
    ])
    for (const page of [playlists, favorites, history]) {
      expect(Array.isArray(page.items)).toBe(true)
      expect(page.total).toBeGreaterThanOrEqual(0)
    }
  })

  it('搜索与联想', async () => {
    const keyword = (await provider.tracks({ page: 1, size: 1 })).items[0]!.title.slice(0, 2)
    const [tracks, suggestion] = await Promise.all([
      provider.searchTracks(keyword, { page: 1, size: 5 }),
      provider.suggest(keyword),
    ])
    expect(tracks.items.length).toBeGreaterThan(0)
    expect(suggestion.tracks.length + suggestion.albums.length + suggestion.artists.length).toBeGreaterThan(0)
  })

  it('音频规格可读取', async () => {
    const spec = await provider.audioSpec(sampleTrackId)
    expect(spec).not.toBeNull()
    expect(spec?.durationMs ?? 0).toBeGreaterThan(0)
    expect(spec?.codec ?? spec?.format).toBeTruthy()
  })

  it('歌词接口可调用（没歌词时返回 null）', async () => {
    const sheet = await provider.lyrics(sampleTrackId)
    if (sheet) {
      expect(Array.isArray(sheet.lines)).toBe(true)
    } else {
      expect(sheet).toBeNull()
    }
  })

  it('封面需要鉴权头，且返回图片', async () => {
    const track = (await provider.tracks({ page: 1, size: 30 })).items.find((item) => item.coverId)
    expect(track?.coverId).toBeTruthy()
    const image = provider.image(track!.coverId!, 300)

    const authorized = await fetch(image.url, { headers: image.headers })
    expect(authorized.status).toBe(200)
    expect(authorized.headers.get('content-type')).toMatch(/^image\//)

    const anonymous = await fetch(image.url)
    expect(anonymous.headers.get('content-type')).not.toMatch(/^image\//)
  })

  it('播放地址支持 Range 断点，且鉴权只能走请求头', async () => {
    const stream = await provider.stream(sampleTrackId, { quality: 'original', allowTranscode: false })
    expect(stream.transport).toBe('progressive')
    expect(stream.url).not.toContain('token')

    const ranged = await fetch(stream.url, { headers: { ...stream.headers, Range: 'bytes=0-1023' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('content-type')).toMatch(/^audio\//)
    expect(ranged.headers.get('accept-ranges')).toBe('bytes')
    expect(ranged.headers.get('content-range')).toMatch(/^bytes 0-1023\/\d+$/)
    await ranged.arrayBuffer()

    // query token 不被接受：不带头时不应该拿到音频
    const anonymous = await fetch(`${stream.url}&token=${session.token}`, { headers: { Range: 'bytes=0-1023' } })
    expect(anonymous.headers.get('content-type')).not.toMatch(/^audio\//)
  })

  it('漫游电台可以开始并推进', async () => {
    const start = await provider.radioStart()
    expect(start.current.id).toBeTruthy()
    expect(start.cursor).toBeTruthy()
    const next = await provider.radioNext(start.cursor!)
    expect(next.current.id).toBeTruthy()
  })

  it('收藏的写入与撤销（设置 FNOS_CONTRACT_MUTATE=1 才跑）', async () => {
    if (process.env['FNOS_CONTRACT_MUTATE'] !== '1') return
    const before = await provider.favorites({ page: 1, size: 1 })
    await provider.setFavorite(sampleTrackId, true)
    const added = await provider.favorites({ page: 1, size: 1 })
    expect(added.total).toBe(before.total + 1)
    await provider.setFavorite(sampleTrackId, false)
    const removed = await provider.favorites({ page: 1, size: 1 })
    expect(removed.total).toBe(before.total)
  })
})
