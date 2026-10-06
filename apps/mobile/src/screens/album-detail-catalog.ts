import { normalizeName } from '@qj/core-domain'
import type { CatalogPage, CatalogTrack, MusicInfoSourceRef } from '@/lib/external-music-info'

export class CatalogTracklistError extends Error {
  constructor(readonly status: string, message: string) {
    super(message)
  }
}

export function catalogQuerySourceCurrent(
  page: CatalogPage<CatalogTrack> | undefined,
  active: MusicInfoSourceRef | undefined,
  catalogMode: boolean,
  expected: MusicInfoSourceRef | undefined,
): boolean {
  if (!page || page.status !== 'ok' || !active) return false
  const source = page.source
  if (catalogMode && (!expected || expected.instanceId !== active.instanceId || expected.serviceId !== active.serviceId || expected.type !== active.type)) return false
  return source.instanceId === active.instanceId && source.serviceId === active.serviceId && source.type === active.type
}

export function catalogEditionMatches(localName: string, edition?: string): boolean {
  const normalized = normalizeName(edition ?? '')
  if (!normalized || ['专辑', 'album', 'studio', '录音室', '录音室版', 'ep', 'single'].includes(normalized)) return true
  return normalizeName(localName).includes(normalized)
}
