/**
 * 飞牛音乐（fnOS Music / mediasrv）私有 API 端点表。
 *
 * 这份表是从 web 端产物里完整提取 + 实测校对得到的，是**唯一**允许出现端点字符串的地方；
 * fnOS 升级导致接口漂移时只改这里，再跑 `pnpm test:contract` 验证。
 * 详细实测记录见仓库 docs/fnos-music-api.md。
 */
export const FNOS_API_PREFIX = '/music/api/v1'

export const FNOS_ENDPOINTS = {
  sys: {
    config: '/sys/config',
    initializationState: '/initialization/state',
  },
  user: {
    passwordLogin: '/user/password-login',
    authLogin: '/user/auth-login',
    me: '/user/me',
    logout: '/user/logout',
    passwdChange: '/user/passwd-change',
  },
  album: {
    list: '/album/list',
    detail: '/album/detail',
    artistDetailList: '/album/artist-detail/list',
  },
  artist: {
    list: '/artist/list',
    listAll: '/artist/list-all',
    detail: '/artist/detail',
  },
  genre: {
    list: '/genre/list',
    detail: '/genre/detail',
  },
  track: {
    list: '/track/list',
    /** ?guid= */
    metadata: '/track/metadata',
    /** ?albumGUID= */
    albumDetailList: '/track/album-detail/list',
    /** ?artistGUID= */
    artistDetailList: '/track/artist-detail/list',
    /** ?genreGUID= */
    genreDetailList: '/track/genre-detail/list',
    /** ?playlistGUID= */
    playlistDetailList: '/track/playlist-detail/list',
    stream: '/track/stream',
    transcode: '/track/transcode',
    transcodeHeartbeat: '/track/transcode/heartbeat',
    transcodeQuit: '/track/transcode/quit',
    hlsPreset: '/track/hls/:guid/preset.m3u8',
    /** GET ?deviceId= */
    roamStart: '/track/roam-start',
    /** GET ?deviceId=&relativeRoamId= */
    roamNext: '/track/roam-next',
    /** GET ?deviceId=&relativeRoamId= */
    roamPrevious: '/track/roam-previous',
  },
  playlist: {
    list: '/playlist/list',
    detail: '/playlist/detail',
    create: '/playlist/create',
    edit: '/playlist/edit',
    delete: '/playlist/delete',
    addTrack: '/playlist/add-track',
    removeTrack: '/playlist/remove-track',
  },
  favoriteTrack: {
    list: '/favorite-track/list',
    /** POST { trackGuid } */
    create: '/favorite-track/create',
    /** POST { trackGuid } */
    delete: '/favorite-track/delete',
  },
  playHistory: {
    list: '/play-history/list',
    delete: '/play-history/delete',
  },
  lyric: {
    list: '/lyric/list',
  },
  search: {
    track: '/search/track',
    album: '/search/album',
    artist: '/search/artist',
    playlist: '/search/playlist',
    suggest: '/search/suggest',
  },
  sharedLibrary: {
    list: '/shared-library/list',
  },
  static: {
    cover: '/static/cover',
  },
  event: {
    report: '/event/report',
  },
} as const

/** 飞牛自有错误码 */
export const FNOS_CODES = {
  ok: 0,
  invalidToken: 99999,
  unknownError: 100001,
  invalidArguments: 100002,
  forbiddenAdminOnly: 100003,
  notFound: 100005,
} as const
