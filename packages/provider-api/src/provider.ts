import type {
  Album,
  Artist,
  AudioSpec,
  Capabilities,
  Genre,
  HttpResource,
  LyricSheet,
  Page,
  PageRequest,
  Playlist,
  SessionUser,
  StreamOptions,
  StreamRequest,
  Track,
} from '@qj/core-domain'
import type { Credentials, ProviderId, ProviderSession, ServerConnection } from './connection'

export interface SearchSuggestion {
  tracks: Track[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
}

/** 电台（漫游）一次推进返回的三元组 */
export interface RadioSlice {
  current: Track
  next?: Track
  previous?: Track
  /** 推进游标，飞牛是 roamId */
  cursor?: string
}

export interface PlaybackReport {
  trackId: string
  /** 已播放毫秒数 */
  positionMs: number
  finished: boolean
}

export interface LyricOffsetUpdate {
  trackId: string
  /** 服务端歌词条目 id，来自 LyricSheet.id */
  lyricId: string
  /** 正值表示歌词提前（毫秒） */
  offsetMs: number
}

/**
 * 所有后端都要实现的统一契约。
 * 带 `?` 的方法由 capabilities 决定是否存在，UI 必须先查能力再调用。
 */
export interface MusicProvider {
  readonly providerId: ProviderId
  readonly connection: ServerConnection
  readonly capabilities: Capabilities

  // ---- 认证 ----
  login(credentials: Credentials): Promise<ProviderSession>
  restoreSession(session: ProviderSession): void
  currentUser(): Promise<SessionUser>
  logout(): Promise<void>

  // ---- 浏览 ----
  albums(request: PageRequest): Promise<Page<Album>>
  album(albumId: string): Promise<Album>
  albumTracks(albumId: string, request: PageRequest): Promise<Page<Track>>
  artists(request: PageRequest): Promise<Page<Artist>>
  artistAlbums(artistId: string, request: PageRequest): Promise<Page<Album>>
  artistTracks(artistId: string, request: PageRequest): Promise<Page<Track>>
  tracks(request: PageRequest): Promise<Page<Track>>
  genres(request: PageRequest): Promise<Page<Genre>>
  genreTracks(genreId: string, request: PageRequest): Promise<Page<Track>>
  playlists(request: PageRequest): Promise<Page<Playlist>>
  playlistTracks(playlistId: string, request: PageRequest): Promise<Page<Track>>

  // ---- 收藏与历史 ----
  favorites?(request: PageRequest): Promise<Page<Track>>
  setFavorite?(trackId: string, favorite: boolean): Promise<void>
  history?(request: PageRequest): Promise<Page<Track>>

  // ---- 搜索 ----
  suggest?(keyword: string): Promise<SearchSuggestion>
  searchTracks(keyword: string, request: PageRequest): Promise<Page<Track>>
  searchAlbums(keyword: string, request: PageRequest): Promise<Page<Album>>
  searchArtists(keyword: string, request: PageRequest): Promise<Page<Artist>>

  // ---- 媒体 ----
  /** 返回可直接交给播放器的 url + headers（飞牛不支持 query token） */
  stream(trackId: string, options: StreamOptions): Promise<StreamRequest>
  /** 封面同样需要鉴权头 */
  image(coverId: string, sizePx?: number): HttpResource
  lyrics?(trackId: string): Promise<LyricSheet | null>
  audioSpec?(trackId: string): Promise<AudioSpec | null>

  // ---- 电台 ----
  radioStart?(): Promise<RadioSlice>
  radioNext?(cursor: string): Promise<RadioSlice>
  radioPrevious?(cursor: string): Promise<RadioSlice>

  // ---- 上报 ----
  /**
   * 上报播放。飞牛这类后端只记一次「起播」事件（用 positionMs 反推起播时刻，
   * finished 会被忽略）；Emby 这类支持进度上报的后端才会用到完整字段。
   */
  reportPlayback?(report: PlaybackReport): Promise<void>
  /** 歌词时间偏移写回服务端，capabilities.lyricOffsetWriteback 为 true 时才存在 */
  setLyricOffset?(update: LyricOffsetUpdate): Promise<void>
}

export interface ProviderFactory {
  readonly providerId: ProviderId
  /** 设置页里展示的后端名称 */
  readonly label: string
  create(connection: ServerConnection, session?: ProviderSession): MusicProvider
}
