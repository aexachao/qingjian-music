import { z } from 'zod'

/** 统一响应信封：HTTP 多为 200，真正的成功标志是 code === 0 */
export const envelopeSchema = z.object({
  code: z.number(),
  msg: z.string().nullish(),
  data: z.unknown(),
})

export const fnUserSchema = z.object({
  guid: z.string(),
  name: z.string(),
  role: z.string().nullish(),
  lastAccessedAt: z.number().nullish(),
  createdAt: z.number().nullish(),
  updatedAt: z.number().nullish(),
})

export const fnLoginSchema = z.object({
  userToken: z.string(),
  user: fnUserSchema,
})

export const fnArtistRefSchema = z.object({
  guid: z.string(),
  name: z.string(),
  coverId: z.string().nullish(),
})

export const fnAlbumRefSchema = z.object({
  guid: z.string(),
  name: z.string(),
  coverId: z.string().nullish(),
  releaseDate: z.string().nullish(),
  barcode: z.string().nullish(),
  createdAt: z.number().nullish(),
  updatedAt: z.number().nullish(),
})

export const fnGenreRefSchema = z.object({
  guid: z.string(),
  name: z.string(),
  coverId: z.string().nullish(),
  trackCount: z.number().nullish(),
})

export const fnAudioSpecSchema = z.object({
  codec: z.string().nullish(),
  format: z.string().nullish(),
  container: z.string().nullish(),
  bitrate: z.number().nullish(),
  sampleRate: z.number().nullish(),
  bitDepth: z.number().nullish(),
  channel: z.number().nullish(),
  channels: z.number().nullish(),
  duration: z.number().nullish(),
  size: z.number().nullish(),
  path: z.string().nullish(),
})

export const fnTrackSchema = z.object({
  guid: z.string(),
  title: z.string(),
  coverId: z.string().nullish(),
  year: z.number().nullish(),
  discNo: z.number().nullish(),
  trackNo: z.number().nullish(),
  isrc: z.string().nullish(),
  duration: z.number().nullish(),
  isCue: z.boolean().nullish(),
  /** 实测 /track/list 会带这个字段，收藏按钮拿它做初始状态 */
  isFavorite: z.boolean().nullish(),
  createdAt: z.number().nullish(),
  updatedAt: z.number().nullish(),
  album: fnAlbumRefSchema.nullish(),
  artists: z.array(fnArtistRefSchema).nullish(),
  genres: z.array(fnGenreRefSchema).nullish(),
  audioSpec: fnAudioSpecSchema.nullish(),
})

export const fnAlbumSchema = z.object({
  guid: z.string(),
  name: z.string(),
  coverId: z.string().nullish(),
  releaseDate: z.string().nullish(),
  barcode: z.string().nullish(),
  artists: z.array(fnArtistRefSchema).nullish(),
  trackCount: z.number().nullish(),
  createdAt: z.number().nullish(),
  updatedAt: z.number().nullish(),
})

export const fnArtistSchema = z.object({
  guid: z.string(),
  name: z.string(),
  coverId: z.string().nullish(),
  trackCount: z.number().nullish(),
  albumCount: z.number().nullish(),
})

export const fnPlaylistSchema = z.object({
  guid: z.string(),
  name: z.string(),
  coverId: z.string().nullish(),
  description: z.string().nullish(),
  trackCount: z.number().nullish(),
  createdAt: z.number().nullish(),
  updatedAt: z.number().nullish(),
})

/** 列表响应统一形状：{ list, total, sort } */
export function fnListSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    list: z.array(item).nullish(),
    total: z.number().nullish(),
    sort: z.string().nullish(),
  })
}

export const fnSuggestSchema = z.object({
  track: z.object({ total: z.number().nullish(), items: z.array(fnTrackSchema).nullish() }).nullish(),
  album: z.object({ total: z.number().nullish(), items: z.array(fnAlbumSchema).nullish() }).nullish(),
  artist: z.object({ total: z.number().nullish(), items: z.array(fnArtistSchema).nullish() }).nullish(),
  playlist: z.object({ total: z.number().nullish(), items: z.array(fnPlaylistSchema).nullish() }).nullish(),
})

/**
 * 歌词条目字段已用真实响应确认：
 * `{guid, source: 3, content: "[00:15.97]…", createdAt, updatedAt, isLRC: true, offset: 0}`，
 * 顶层 `preferred` 是「首选歌词条目的 guid」字符串，不是对象。
 */
export const fnLyricEntrySchema = z.object({
  guid: z.string(),
  content: z.string().nullish(),
  /** 来源编号（实测是数字，含义未知） */
  source: z.union([z.string(), z.number()]).nullish(),
  isLRC: z.boolean().nullish(),
  /** 服务端保存的时间偏移，单位毫秒 */
  offset: z.number().nullish(),
  createdAt: z.number().nullish(),
  updatedAt: z.number().nullish(),
})

export const fnLyricListSchema = z.object({
  list: z.array(fnLyricEntrySchema).nullish(),
  preferred: z.string().nullish(),
})

/**
 * /track/transcode 的实测响应：
 * `{status:'success', errno:'', errmsg:'', hlsTime:2, url:'/music/api/v1/track/hls/<guid>/preset.m3u8'}`，
 * 失败时 status 为 failed，errmsg 例如 "playLink not found"。
 */
export const fnTranscodeSchema = z.object({
  status: z.string().nullish(),
  errno: z.union([z.string(), z.number()]).nullish(),
  errmsg: z.string().nullish(),
  hlsTime: z.number().nullish(),
  url: z.string().nullish(),
})

export const fnMetadataSchema = z.object({
  audioSpec: fnAudioSpecSchema.nullish(),
})

export type FnLyricEntry = z.infer<typeof fnLyricEntrySchema>
export type FnTrack = z.infer<typeof fnTrackSchema>
export type FnAlbum = z.infer<typeof fnAlbumSchema>
export type FnArtist = z.infer<typeof fnArtistSchema>
export type FnGenre = z.infer<typeof fnGenreRefSchema>
export type FnPlaylist = z.infer<typeof fnPlaylistSchema>
export type FnAudioSpec = z.infer<typeof fnAudioSpecSchema>
export type FnUser = z.infer<typeof fnUserSchema>
