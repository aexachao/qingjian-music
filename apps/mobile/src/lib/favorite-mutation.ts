export class FavoriteMutationCancelledError extends Error {
  constructor() {
    super('Favorite mutation belongs to an inactive server session')
    this.name = 'FavoriteMutationCancelledError'
  }
}

export function isFavoriteMutationCancelled(error: unknown): boolean {
  return error instanceof FavoriteMutationCancelledError
}

interface FavoriteMutation {
  serverId: string
  trackId: string
  favorite: boolean
  initialFavorite: boolean
  isCurrent: () => boolean
  apply: (favorite: boolean) => void
  execute: () => Promise<void>
  afterSuccess: () => Promise<void>
}

interface MutationEntry {
  latest: number
  latestFavorite: boolean
  committed: boolean
  tail: Promise<void>
}

const mutations = new Map<string, MutationEntry>()

/** Optimistically applies mutations, then commits provider writes in intent order per server and track. */
export function runFavoriteMutation({
  serverId,
  trackId,
  favorite,
  initialFavorite,
  isCurrent,
  apply,
  execute,
  afterSuccess,
}: FavoriteMutation): Promise<boolean> {
  if (!isCurrent()) return Promise.reject(new FavoriteMutationCancelledError())

  const key = JSON.stringify([serverId, trackId])
  let entry = mutations.get(key)
  if (!entry) {
    entry = { latest: 0, latestFavorite: favorite, committed: initialFavorite, tail: Promise.resolve() }
    mutations.set(key, entry)
  }
  const currentEntry = entry
  const intent = ++currentEntry.latest
  currentEntry.latestFavorite = favorite
  apply(favorite)

  const result = currentEntry.tail.then(async () => {
    if (!isCurrent()) throw new FavoriteMutationCancelledError()
    try {
      await execute()
    } catch (error) {
      if (!isCurrent()) throw new FavoriteMutationCancelledError()
      if (currentEntry.latest === intent) apply(currentEntry.committed)
      throw error
    }
    if (!isCurrent()) throw new FavoriteMutationCancelledError()
    currentEntry.committed = favorite
    try {
      await afterSuccess()
    } catch {
      // The provider write succeeded; cache refresh failure must not report a failed favorite change.
    }
    if (!isCurrent()) throw new FavoriteMutationCancelledError()
    // Refetch may finish after a newer optimistic tap. Restore the latest user intent afterward.
    apply(currentEntry.latestFavorite)
    return favorite
  })

  currentEntry.tail = result.then(() => undefined, () => undefined)
  const cleanup = () => {
    if (mutations.get(key) === currentEntry && currentEntry.latest === intent) mutations.delete(key)
  }
  void result.then(cleanup, cleanup)
  return result
}

const TRACK_QUERY_ROOTS = new Set([
  'favorites', 'album-tracks', 'artist-top-tracks', 'artist-tracks-all',
  'genre-tracks', 'playlist-tracks', 'tracks', 'recent-tracks', 'history', 'search-all-tracks',
])
const HOME_TRACK_QUERIES = new Set(['recent-tracks', 'rediscover-tracks'])

/** Match only track-list caches whose key includes this exact server identity. */
export function isTrackQueryForServer(queryKey: readonly unknown[], serverId: string): boolean {
  if (queryKey[0] === 'home') {
    return HOME_TRACK_QUERIES.has(String(queryKey[1])) && queryKey[2] === serverId
  }
  return TRACK_QUERY_ROOTS.has(String(queryKey[0])) && queryKey[1] === serverId
}

function patchTrackPage(value: unknown, trackId: string, favorite: boolean): { value: unknown; touched: boolean } {
  if (!value || typeof value !== 'object') return { value, touched: false }
  if (Array.isArray(value)) {
    let touched = false
    const next = value.map((item) => {
      const result = patchTrackPage(item, trackId, favorite)
      touched ||= result.touched
      return result.value
    })
    return { value: touched ? next : value, touched }
  }
  const record = value as Record<string, unknown>
  if (Array.isArray(record.items)) {
    let touched = false
    const items = record.items.map((item) => {
      if (!item || typeof item !== 'object' || (item as { id?: unknown }).id !== trackId) return item
      touched = true
      return { ...(item as Record<string, unknown>), isFavorite: favorite }
    })
    return { value: touched ? { ...record, items } : value, touched }
  }
  if (Array.isArray(record.pages)) {
    const result = patchTrackPage(record.pages, trackId, favorite)
    return { value: result.touched ? { ...record, pages: result.value } : value, touched: result.touched }
  }
  return { value, touched: false }
}

export function patchTrackQueryData<T>(data: T, trackId: string, favorite: boolean): T {
  return patchTrackPage(data, trackId, favorite).value as T
}

interface PlayerTrackIdentity {
  trackId: string
  serverId: string
}

export function canPatchPlayerTrack(
  state: { queue: PlayerTrackIdentity[]; history: PlayerTrackIdentity[]; baseQueue: PlayerTrackIdentity[] },
  serverId: string,
  trackId: string,
): boolean {
  if (state.queue[0]?.serverId !== serverId) return false
  return [...state.queue, ...state.history, ...state.baseQueue]
    .every((item) => item.trackId !== trackId || item.serverId === serverId)
}
