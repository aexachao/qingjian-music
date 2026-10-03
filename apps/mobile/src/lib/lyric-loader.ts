import { QueryObserver, queryOptions, type QueryClient } from '@tanstack/react-query'
import type { LyricSheet } from '@qj/core-domain'
import { LYRIC_TIER_RANK } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import { captureLyricCacheGeneration, readCachedLyric, writeCachedLyric } from '@/lib/lyric-cache'
import { fetchExternalLyricSheet, type LyricQueryMeta } from '@/lib/external-lyrics'
import { externalSourceCacheIdentity } from '@/lib/external-source-cache-key'
import { getLyricsSource, useExternalSourcesStore } from '@/lib/external-source'

/** A complete word-timed lyric is stable enough to keep for a while. */
export const LYRIC_STALE_MS = 30 * 60_000
/** Lower fidelity lyrics need another chance to be improved by an external source. */
export const LYRIC_RETRY_STALE_MS = 5 * 60_000

/** Lyrics query key shared by React hooks and imperative callers. It never contains a token. */
export function lyricQueryKey(
  serverId: string | undefined,
  trackId: string,
  sourceRevision = useExternalSourcesStore.getState().revision,
  sourceIdentity = externalSourceCacheIdentity(useExternalSourcesStore.getState().services),
) {
  return ['lyrics', serverId, trackId, sourceRevision, sourceIdentity] as const
}

/** lyrics is an optional provider capability. */
export function fetchLyricSheet(
  provider: Pick<MusicProvider, 'lyrics'> | null | undefined,
  trackId: string,
  signal?: AbortSignal,
): Promise<LyricSheet | null> {
  return provider?.lyrics ? provider.lyrics(trackId, signal ? { signal } : undefined) : Promise.resolve(null)
}

/** Match React Query freshness to the quality of the resolved result. */
export function lyricStaleTime(sheet: LyricSheet | null | undefined): number {
  if (!hasLyricContent(sheet)) return 0
  return sheet.tier === 'word' ? LYRIC_STALE_MS : LYRIC_RETRY_STALE_MS
}

function hasLyricContent(sheet: LyricSheet | null | undefined): sheet is LyricSheet {
  return Boolean(sheet?.lines.some((line) => !(line.atMs < 0) && typeof line?.text === 'string' && line.text.trim().length > 0))
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) return reason
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal.reason)
}

function staleSourceError(): Error {
  const error = new Error('Lyrics source changed before this query started')
  error.name = 'AbortError'
  return error
}

function currentSourceMatches(sourceRevision: number, sourceIdentity: string): boolean {
  const current = useExternalSourcesStore.getState()
  return current.revision === sourceRevision && externalSourceCacheIdentity(current.services) === sourceIdentity
}

/**
 * Resolve one lyric sheet. The source config is snapshotted before any await; a
 * stale request may still serve its caller, but it cannot replace disk cache for
 * a configuration saved while the request was in flight.
 */
export async function loadLyricSheet(
  provider: Pick<MusicProvider, 'lyrics'> | null | undefined,
  serverId: string | undefined,
  trackId: string,
  meta?: LyricQueryMeta,
  sourceRevision = useExternalSourcesStore.getState().revision,
  sourceIdentity = externalSourceCacheIdentity(useExternalSourcesStore.getState().services),
  signal?: AbortSignal,
): Promise<LyricSheet | null> {
  throwIfAborted(signal)
  // `fetchQuery` can defer starting this function. Do not run an old key against
  // whichever source happens to be current when it eventually starts.
  if (!currentSourceMatches(sourceRevision, sourceIdentity)) throw staleSourceError()
  const generation = captureLyricCacheGeneration()
  // Do not let getLyricsSource read a different service after the provider awaits.
  const configuredSource = { ...getLyricsSource() }
  const cached = serverId ? readCachedLyric(serverId, trackId) : null

  // A matching word-timed result cannot be improved by the available sources.
  // Lower tiers must continue so a recently configured source gets a chance.
  if (
    hasLyricContent(cached?.sheet)
    && cached.sheet.tier === 'word'
    // Older caches discarded credits; refresh online, retain the offline fallback.
    && cached.metadataParsed
    && cached.sourceIdentity === sourceIdentity
    && cached.sourceRevision === sourceRevision
  ) {
    return cached.sheet
  }

  let best: LyricSheet | null = null
  try {
    best = await fetchLyricSheet(provider, trackId, signal)
    throwIfAborted(signal)
    if (!hasLyricContent(best)) best = null
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    // Continue with an optional external source or the saved offline sheet.
  }

  if ((!best || best.tier !== 'word') && meta?.title && configuredSource.type !== 'none' && configuredSource.baseUrl.trim()) {
    try {
      const external = await fetchExternalLyricSheet(meta, configuredSource, signal)
      throwIfAborted(signal)
      if (hasLyricContent(external) && (!best || LYRIC_TIER_RANK[external.tier] <= LYRIC_TIER_RANK[best.tier])) best = external
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
      // An optional source failing must not discard the provider's lyric.
    }
  }

  throwIfAborted(signal)
  if (!best && hasLyricContent(cached?.sheet)) return cached.sheet

  // A stale request must never replace the cache under a newer source revision.
  if (best && serverId && currentSourceMatches(sourceRevision, sourceIdentity)) {
    writeCachedLyric(serverId, trackId, best, { generation, sourceIdentity, sourceRevision })
  }
  return best
}

/**
 * Shared options for `useQuery` and `QueryClient.fetchQuery`. Keeping this
 * factory central makes both paths share an exact key and in-flight promise.
 */
export function lyricQueryOptions(
  provider: Pick<MusicProvider, 'lyrics'> | null | undefined,
  serverId: string | undefined,
  trackId: string,
  meta?: LyricQueryMeta,
  sourceRevision = useExternalSourcesStore.getState().revision,
  sourceIdentity = externalSourceCacheIdentity(useExternalSourcesStore.getState().services),
) {
  return queryOptions({
    queryKey: lyricQueryKey(serverId, trackId, sourceRevision, sourceIdentity),
    queryFn: ({ signal }) => loadLyricSheet(provider, serverId, trackId, meta, sourceRevision, sourceIdentity, signal),
    staleTime: (query) => lyricStaleTime(query.state.data),
  })
}

export type { LyricQueryMeta }


/** Imperative sharing is foreground work too; protect it from speculative cancellation. */
export async function fetchForegroundLyric(client: QueryClient, options: ReturnType<typeof lyricQueryOptions>): Promise<LyricSheet | null> {
  const observer = new QueryObserver(client, { ...options, enabled: false })
  const unsubscribe = observer.subscribe(() => undefined)
  try {
    return await client.fetchQuery(options)
  } finally {
    unsubscribe()
  }
}
