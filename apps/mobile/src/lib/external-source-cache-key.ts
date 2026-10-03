import type { SourceService } from './external-source'

/** Stable, non-secret identity for external source configuration and query caches. */
export function externalSourceCacheIdentity(services: readonly SourceService[]): string {
  return JSON.stringify(services.map((service) => [
    service.id,
    service.type,
    service.baseUrl.trim().replace(/\/+$/, ''),
    service.useLyrics,
    service.useMusicInfo,
  ]))
}
