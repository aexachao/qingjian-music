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

/** 歌词条目字段名尚未在真实数据上确认，先宽松接收再由 mapper 提取文本 */
export const fnLyricListSchema = z.object({
  list: z.array(z.record(z.string(), z.unknown())).nullish(),
  preferred: z.unknown().nullish(),
})

export const fnMetadataSchema = z.object({
  audioSpec: fnAudioSpecSchema.nullish(),
})

export type FnTrack = z.infer<typeof fnTrackSchema>
export type FnAlbum = z.infer<typeof fnAlbumSchema>
export type FnArtist = z.infer<typeof fnArtistSchema>
export type FnGenre = z.infer<typeof fnGenreRefSchema>
export type FnPlaylist = z.infer<typeof fnPlaylistSchema>
export type FnAudioSpec = z.infer<typeof fnAudioSpecSchema>
export type FnUser = z.infer<typeof fnUserSchema>
