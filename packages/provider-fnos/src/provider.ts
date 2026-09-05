import {
  type Album,
  type Artist,
  type AudioSpec,
  type Capabilities,
  type Genre,
  type HttpResource,
  type LyricSheet,
  MusicError,
  type Page,
  type PageRequest,
  type Playlist,
  type SessionUser,
  type SortSpec,
  type StreamOptions,
  type StreamSession,
  type StreamRequest,
  type Track,
  makePage,
} from '@qj/core-domain'
import type {
  Credentials,
  LyricOffsetUpdate,
  MusicProvider,
  PlaybackReport,
  ProviderFactory,
  ProviderSession,
  RadioSlice,
  SearchSuggestion,
  ServerConnection,
} from '@qj/provider-api'
import { z } from 'zod'
import { FnosClient } from './client'
import { FNOS_ENDPOINTS, FNOS_EVENT_TYPES } from './endpoints'
import {
  formatSort,
  mapAlbum,
  mapArtist,
  mapAudioSpec,
  mapGenre,
  mapLyricSheet,
  mapPlaylist,
  mapTrack,
  mapUser,
} from './mappers'
import {
  fnAlbumSchema,
  fnArtistSchema,
  fnGenreRefSchema,
  fnListSchema,
  fnLoginSchema,
  fnLyricListSchema,
  fnMetadataSchema,
  fnPlaylistSchema,
  fnSuggestSchema,
  fnTrackSchema,
  fnTranscodeSchema,
  fnUserSchema,
} from './schemas'

export interface FnosProviderDeps {
  /** 登录要传 sha256(明文密码) 的十六进制小写串；RN 侧用 expo-crypto，Node 侧用 node:crypto */
  sha256Hex(input: string): Promise<string>
  /** 设备标识，登录与漫游接口都要用，需在设备上持久化 */
  deviceId: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /**
   * token 失效时取回明文密码用于静默重登（RN 侧读 Keychain）。
   * 返回 undefined 表示不要重登，错误直接抛给 UI。
   */
  recoverPassword?(connection: ServerConnection): Promise<string | undefined>
  /** 静默重登成功后回调，宿主可以顺手把新会话写回存储 */
  onSessionRefreshed?(connection: ServerConnection, session: ProviderSession): void | Promise<void>
}

export const FNOS_CAPABILITIES: Capabilities = {
  favorites: true,
  playlists: 'write',
  playHistory: true,
  lyrics: 'synced',
  // 实测确认：POST /event/report 的 lyric_offset_change 会写进 /lyric/list 的 offset 字段
  lyricOffsetWriteback: true,
  radio: true,
  // 实测确认：POST /track/transcode → preset.m3u8（fMP4/2 秒分片）+ 10 秒心跳 + quit
  transcode: true,
  searchSuggest: true,
  genres: true,
  ratings: false,
  multiLibrary: true,
}

/** 心跳间隔：web 端写死 10 秒，服务端按这个节奏判活 */
const TRANSCODE_HEARTBEAT_MS = 10_000

/**
 * 音质档位 → transcode 的 bitrate。飞牛只认 128/256/320 三档且 codec 恒为 flac，
 * web 端永远只发 320（它的默认音质就是 original）。
 */
function transcodeBitrate(quality: StreamOptions['quality']): number {
  if (quality === 'low') return 128
  if (quality === 'medium') return 256
  return 320
}

const trackListSchema = fnListSchema(fnTrackSchema)
const albumListSchema = fnListSchema(fnAlbumSchema)
const artistListSchema = fnListSchema(fnArtistSchema)
const genreListSchema = fnListSchema(fnGenreRefSchema)
const playlistListSchema = fnListSchema(fnPlaylistSchema)

const roamEntrySchema = z.object({
  track: fnTrackSchema.nullish(),
  file: fnTrackSchema.nullish(),
  roamId: z.string().nullish(),
})
const roamSliceSchema = z.object({
  current: roamEntrySchema.nullish(),
  next: roamEntrySchema.nullish(),
  previous: roamEntrySchema.nullish(),
})

/** 飞牛音乐（fnOS Music）后端实现 */
export class FnosProvider implements MusicProvider {
  readonly providerId = 'fnos' as const
  readonly capabilities = FNOS_CAPABILITIES

  private readonly client: FnosClient
  private session: ProviderSession | undefined

  constructor(
    readonly connection: ServerConnection,
    private readonly deps: FnosProviderDeps,
    session?: ProviderSession,
  ) {
    this.client = new FnosClient({
      baseUrl: connection.baseUrl,
      token: session?.token,
      timeoutMs: deps.timeoutMs,
      fetchImpl: deps.fetchImpl,
      ...(deps.recoverPassword ? { reauthorize: () => this.silentRelogin() } : {}),
    })
    this.session = session
  }

  /** token 过期后的静默重登：拿 Keychain 里的密码换新 token，失败就放弃 */
  private async silentRelogin(): Promise<string | undefined> {
    if (!this.deps.recoverPassword) return undefined
    const password = await this.deps.recoverPassword(this.connection)
    if (!password) return undefined
    const session = await this.login({ password })
    await this.deps.onSessionRefreshed?.(this.connection, session)
    return session.token
  }

  // ---- 认证 ----

  async login(credentials: Credentials): Promise<ProviderSession> {
    const passwordHash = await this.deps.sha256Hex(credentials.password)
    const data = await this.client.post(
      FNOS_ENDPOINTS.user.passwordLogin,
      { username: this.connection.username, password: passwordHash, deviceId: this.deps.deviceId },
      fnLoginSchema,
    )
    const session: ProviderSession = {
      token: data.userToken,
      user: mapUser(data.user),
      deviceId: this.deps.deviceId,
      createdAt: Date.now(),
    }
    this.restoreSession(session)
    return session
  }

  restoreSession(session: ProviderSession): void {
    this.session = session
    this.client.setToken(session.token)
  }

  async currentUser(): Promise<SessionUser> {
    return mapUser(await this.client.get(FNOS_ENDPOINTS.user.me, fnUserSchema))
  }

  async logout(): Promise<void> {
    try {
      await this.client.post(FNOS_ENDPOINTS.user.logout, undefined, z.unknown())
    } finally {
      this.session = undefined
      this.client.setToken(undefined)
    }
  }

  // ---- 浏览 ----

  albums(request: PageRequest): Promise<Page<Album>> {
    return this.pagedList(FNOS_ENDPOINTS.album.list, albumListSchema, request, mapAlbum, 'album')
  }

  async album(albumId: string): Promise<Album> {
    return mapAlbum(await this.client.get(FNOS_ENDPOINTS.album.detail, fnAlbumSchema, { query: { guid: albumId } }))
  }

  albumTracks(albumId: string, request: PageRequest): Promise<Page<Track>> {
    return this.pagedList(FNOS_ENDPOINTS.track.albumDetailList, trackListSchema, request, mapTrack, 'track', { albumGUID: albumId })
  }

  artists(request: PageRequest): Promise<Page<Artist>> {
    return this.pagedList(FNOS_ENDPOINTS.artist.list, artistListSchema, request, mapArtist, 'artist')
  }

  artistAlbums(artistId: string, request: PageRequest): Promise<Page<Album>> {
    return this.pagedList(FNOS_ENDPOINTS.album.artistDetailList, albumListSchema, request, mapAlbum, 'album', { artistGUID: artistId })
  }

  artistTracks(artistId: string, request: PageRequest): Promise<Page<Track>> {
    return this.pagedList(FNOS_ENDPOINTS.track.artistDetailList, trackListSchema, request, mapTrack, 'track', { artistGUID: artistId })
  }

  tracks(request: PageRequest): Promise<Page<Track>> {
    return this.pagedList(FNOS_ENDPOINTS.track.list, trackListSchema, request, mapTrack, 'track')
  }

  genres(request: PageRequest): Promise<Page<Genre>> {
    return this.pagedList(FNOS_ENDPOINTS.genre.list, genreListSchema, request, mapGenre, 'genre')
  }

  genreTracks(genreId: string, request: PageRequest): Promise<Page<Track>> {
    return this.pagedList(FNOS_ENDPOINTS.track.genreDetailList, trackListSchema, request, mapTrack, 'track', { genreGUID: genreId })
  }

  playlists(request: PageRequest): Promise<Page<Playlist>> {
    return this.pagedList(FNOS_ENDPOINTS.playlist.list, playlistListSchema, request, mapPlaylist, 'playlist')
  }

  playlistTracks(playlistId: string, request: PageRequest): Promise<Page<Track>> {
    return this.pagedList(FNOS_ENDPOINTS.track.playlistDetailList, trackListSchema, request, mapTrack, 'track', { playlistGUID: playlistId })
  }

  // ---- 收藏与历史 ----

  favorites(request: PageRequest): Promise<Page<Track>> {
    return this.pagedList(FNOS_ENDPOINTS.favoriteTrack.list, trackListSchema, request, mapTrack, 'favoriteTrack')
  }

  async setFavorite(trackId: string, favorite: boolean): Promise<void> {
    const path = favorite ? FNOS_ENDPOINTS.favoriteTrack.create : FNOS_ENDPOINTS.favoriteTrack.delete
    // 实测参数名是 trackGuid（不是 guid，也不是 trackGUID）
    await this.client.post(path, { trackGuid: trackId }, z.unknown())
  }

  history(request: PageRequest): Promise<Page<Track>> {
    return this.pagedList(FNOS_ENDPOINTS.playHistory.list, trackListSchema, request, mapTrack, 'playHistory')
  }

  // ---- 搜索 ----

  async suggest(keyword: string): Promise<SearchSuggestion> {
    const data = await this.client.get(FNOS_ENDPOINTS.search.suggest, fnSuggestSchema, { query: { q: keyword } })
    return {
      tracks: (data.track?.items ?? []).map(mapTrack),
      albums: (data.album?.items ?? []).map(mapAlbum),
      artists: (data.artist?.items ?? []).map(mapArtist),
      playlists: (data.playlist?.items ?? []).map(mapPlaylist),
    }
  }

  searchTracks(keyword: string, request: PageRequest): Promise<Page<Track>> {
    return this.pagedList(FNOS_ENDPOINTS.search.track, trackListSchema, request, mapTrack, 'track', { q: keyword })
  }

  searchAlbums(keyword: string, request: PageRequest): Promise<Page<Album>> {
    return this.pagedList(FNOS_ENDPOINTS.search.album, albumListSchema, request, mapAlbum, 'album', { q: keyword })
  }

  searchArtists(keyword: string, request: PageRequest): Promise<Page<Artist>> {
    return this.pagedList(FNOS_ENDPOINTS.search.artist, artistListSchema, request, mapArtist, 'artist', { q: keyword })
  }

  // ---- 媒体 ----

  async stream(trackId: string, options: StreamOptions): Promise<StreamRequest> {
    if (!this.client.hasToken()) {
      throw new MusicError({ code: 'unauthorized', message: '尚未登录，无法播放' })
    }
    // 允许转码时走 HLS 会话（WMA/APE 这类 AVPlayer 解不了的格式只能这样播）
    if (options.allowTranscode) return this.transcodeStream(trackId, options)
    // 直推：实测支持 Range，AVPlayer / ExoPlayer 可直接消费
    return {
      url: this.client.resourceUrl(FNOS_ENDPOINTS.track.stream, { guid: trackId }),
      headers: this.client.authHeaders(),
      transport: 'progressive',
      quality: 'original',
    }
  }

  /**
   * 服务端转码 + HLS。实测流程：
   * 1. POST /track/transcode {guid, output:{codec:'flac', bitrate, channel}} → {status:'success', url}
   * 2. 播放 preset.m3u8（fMP4 分片，2 秒一片；m3u8 与分片都必须带鉴权头）
   * 3. 每 10 秒 POST /track/transcode/heartbeat {guid, timestamp: 播放位置秒}，必须严格递增；
   *    断掉心跳后任务会被回收，分片会返回 410
   * 4. 结束时 POST /track/transcode/quit {guid}
   */
  private async transcodeStream(trackId: string, options: StreamOptions): Promise<StreamRequest> {
    const data = await this.client.post(
      FNOS_ENDPOINTS.track.transcode,
      { guid: trackId, output: { codec: 'flac', bitrate: transcodeBitrate(options.quality), channel: 2 } },
      fnTranscodeSchema,
    )
    const status = (data.status ?? '').toLowerCase()
    if (status !== 'success' && status !== 'ready') {
      throw new MusicError({
        code: 'server',
        message: data.errmsg?.trim() || `转码失败（status=${data.status ?? '未知'}）`,
        ...(data.errno ? { providerCode: data.errno } : {}),
      })
    }
    return {
      url: this.client.resourceUrl(FNOS_ENDPOINTS.track.hlsPreset.replace(':guid', encodeURIComponent(trackId))),
      headers: this.client.authHeaders(),
      transport: 'hls',
      quality: options.quality,
      mimeHint: 'application/vnd.apple.mpegurl',
      session: this.transcodeSession(trackId),
    }
  }

  private transcodeSession(trackId: string): StreamSession {
    // 心跳时间戳必须严格递增，卡住不动就自己 +1 毫秒（对齐 web 端做法）
    let lastSeconds = -1
    return {
      id: trackId,
      heartbeatIntervalMs: TRANSCODE_HEARTBEAT_MS,
      heartbeat: async (positionMs: number) => {
        const seconds = Math.max(0, positionMs) / 1000
        const timestamp = seconds > lastSeconds ? seconds : lastSeconds + 0.001
        lastSeconds = timestamp
        const data = await this.client.post(
          FNOS_ENDPOINTS.track.transcodeHeartbeat,
          { guid: trackId, timestamp: Number(timestamp.toFixed(3)) },
          fnTranscodeSchema,
        )
        // 任务被回收后心跳会返回 failed（errmsg: playLink not found），交给上层重新起会话
        if ((data.status ?? '').toLowerCase() === 'failed') {
          throw new MusicError({
            code: 'notFound',
            message: data.errmsg?.trim() || '转码会话已失效',
            ...(data.errno ? { providerCode: data.errno } : {}),
          })
        }
      },
      close: async () => {
        await this.client.post(FNOS_ENDPOINTS.track.transcodeQuit, { guid: trackId }, fnTranscodeSchema)
      },
    }
  }

  image(coverId: string, sizePx?: number): HttpResource {
    return {
      url: this.client.resourceUrl(FNOS_ENDPOINTS.static.cover, { coverId, size: sizePx }),
      headers: this.client.authHeaders(),
    }
  }

  async lyrics(trackId: string): Promise<LyricSheet | null> {
    const data = await this.client.get(FNOS_ENDPOINTS.lyric.list, fnLyricListSchema, { query: { trackGUID: trackId } })
    return mapLyricSheet(data.list ?? [], data.preferred)
  }

  async audioSpec(trackId: string): Promise<AudioSpec | null> {
    const data = await this.client.get(FNOS_ENDPOINTS.track.metadata, fnMetadataSchema, { query: { guid: trackId } })
    return mapAudioSpec(data.audioSpec) ?? null
  }

  // ---- 上报 ----

  /**
   * 飞牛只收「起播」这一个播放事件（web 端用 sendBeacon 发同样的负载），
   * 没有进度与完成度概念：occurredAt 取起播时刻（毫秒），finished 忽略。
   * 上报成功后 /play-history/list 立刻能查到这首。
   */
  async reportPlayback(report: PlaybackReport): Promise<void> {
    await this.client.post(
      FNOS_ENDPOINTS.event.report,
      {
        events: [
          {
            eventType: FNOS_EVENT_TYPES.trackPlay,
            occurredAt: Date.now() - Math.max(0, Math.round(report.positionMs)),
            payload: { trackGUID: report.trackId },
          },
        ],
      },
      z.unknown(),
    )
  }

  /** 歌词偏移写回：服务端存在歌词条目上，回读走 /lyric/list 的 offset（毫秒） */
  async setLyricOffset(update: LyricOffsetUpdate): Promise<void> {
    await this.client.post(
      FNOS_ENDPOINTS.event.report,
      {
        events: [
          {
            eventType: FNOS_EVENT_TYPES.lyricOffsetChange,
            occurredAt: Date.now(),
            payload: {
              trackGUID: update.trackId,
              lyricGUID: update.lyricId,
              offset: Math.round(update.offsetMs),
            },
          },
        ],
      },
      z.unknown(),
    )
  }

  // ---- 漫游电台 ----

  // 漫游三个接口实测是 GET + query（用 POST 会被 nginx 落到 SPA 首页）
  async radioStart(): Promise<RadioSlice> {
    const data = await this.client.get(FNOS_ENDPOINTS.track.roamStart, roamSliceSchema, {
      query: { deviceId: this.deps.deviceId },
    })
    return this.toRadioSlice(data)
  }

  async radioNext(cursor: string): Promise<RadioSlice> {
    const data = await this.client.get(FNOS_ENDPOINTS.track.roamNext, roamSliceSchema, {
      query: { deviceId: this.deps.deviceId, relativeRoamId: cursor },
    })
    return this.toRadioSlice(data)
  }

  async radioPrevious(cursor: string): Promise<RadioSlice> {
    const data = await this.client.get(FNOS_ENDPOINTS.track.roamPrevious, roamSliceSchema, {
      query: { deviceId: this.deps.deviceId, relativeRoamId: cursor },
    })
    return this.toRadioSlice(data)
  }

  // ---- 内部工具 ----

  private toRadioSlice(data: z.infer<typeof roamSliceSchema>): RadioSlice {
    const current = pickRoamTrack(data.current)
    if (!current) {
      throw new MusicError({ code: 'notFound', message: '漫游没有可播放的曲目' })
    }
    const next = pickRoamTrack(data.next)
    const previous = pickRoamTrack(data.previous)
    const cursor = data.current?.roamId ?? undefined
    return { current, next, previous, cursor }
  }

  private async pagedList<TRaw, TDomain>(
    path: string,
    schema: z.ZodType<{ list?: TRaw[] | null; total?: number | null; sort?: string | null }>,
    request: PageRequest,
    map: (raw: TRaw) => TDomain,
    sortScope: string,
    extraQuery: Record<string, string | number | undefined> = {},
  ): Promise<Page<TDomain>> {
    const data = await this.client.get(path, schema, {
      query: {
        ...extraQuery,
        page: request.page,
        size: request.size,
        sort: formatSort(request.sort, sortScope),
      },
    })
    const items = (data.list ?? []).map(map)
    return makePage(items, data.total ?? items.length, request)
  }
}

function pickRoamTrack(entry: { track?: unknown; file?: unknown } | null | undefined): Track | undefined {
  const raw = entry?.track ?? entry?.file
  if (!raw) return undefined
  const parsed = fnTrackSchema.safeParse(raw)
  return parsed.success ? mapTrack(parsed.data) : undefined
}

export function createFnosFactory(deps: FnosProviderDeps): ProviderFactory {
  return {
    providerId: 'fnos',
    label: '飞牛音乐',
    create: (connection, session) => new FnosProvider(connection, deps, session),
  }
}

export type { SortSpec }
