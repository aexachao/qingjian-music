import { MusicError, type Track } from '@qj/core-domain'
import type { RadioSlice } from '@qj/provider-api'
import { z } from 'zod'
import { mapTrack } from './mappers'
import { fnTrackSchema } from './schemas'

export const roamEntrySchema = z.object({
  track: fnTrackSchema.nullish(),
  file: fnTrackSchema.nullish(),
  roamId: z.string().nullish(),
})
export const roamSliceSchema = z.object({
  current: roamEntrySchema.nullish(),
  next: roamEntrySchema.nullish(),
  previous: roamEntrySchema.nullish(),
})

export function pickRoamTrack(entry: { track?: unknown; file?: unknown } | null | undefined): Track | undefined {
  const raw = entry?.track ?? entry?.file
  if (!raw) return undefined
  const parsed = fnTrackSchema.safeParse(raw)
  return parsed.success ? mapTrack(parsed.data) : undefined
}

export function toRadioSlice(data: z.infer<typeof roamSliceSchema>): RadioSlice {
  const current = pickRoamTrack(data.current)
  if (!current) {
    throw new MusicError({ code: 'notFound', message: '漫游没有可播放的曲目' })
  }
  const next = pickRoamTrack(data.next)
  const previous = pickRoamTrack(data.previous)
  const cursor = data.current?.roamId ?? undefined
  return { current, next, previous, cursor }
}
