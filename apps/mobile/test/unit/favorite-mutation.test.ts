import { describe, expect, it } from 'vitest'
import {
  canPatchPlayerTrack,
  FavoriteMutationCancelledError,
  isTrackQueryForServer,
  patchTrackQueryData,
  runFavoriteMutation,
} from '../../src/lib/favorite-mutation'

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function mutation(
  serverId: string,
  favorite: boolean,
  apply: (value: boolean) => void,
  execute: () => Promise<void>,
  isCurrent = () => true,
) {
  return runFavoriteMutation({
    serverId, trackId: 'track-1', favorite, initialFavorite: !favorite, apply, execute,
    isCurrent, afterSuccess: async () => undefined,
  })
}

describe('favorite mutation ordering and isolation', () => {
  it('an earlier failed write cannot roll back a later successful intent', async () => {
    const oldWrite = deferred()
    const applied: boolean[] = []
    const first = mutation('server-a', true, (value) => applied.push(value), () => oldWrite.promise)
    const firstResult = first.catch((error: unknown) => error)
    const second = mutation('server-a', false, (value) => applied.push(value), async () => undefined)
    oldWrite.reject(new Error('first request failed'))

    await expect(firstResult).resolves.toBeInstanceOf(Error)
    await expect(second).resolves.toBe(false)
    expect(applied).toEqual([true, false, false])
  })

  it('a latest failed write rolls back to the last committed value', async () => {
    const failedWrite = deferred()
    const applied: boolean[] = []
    const first = mutation('server-b', true, (value) => applied.push(value), async () => undefined)
    await expect(first).resolves.toBe(true)
    const second = mutation('server-b', false, (value) => applied.push(value), () => failedWrite.promise)
    const secondResult = second.catch((error: unknown) => error)
    failedWrite.reject(new Error('latest request failed'))
    await expect(secondResult).resolves.toBeInstanceOf(Error)
    expect(applied).toEqual([true, true, false, true])
  })

  it('keeps writes for the same track on different servers independent', async () => {
    const serverA = deferred()
    const serverB = deferred()
    const calls: string[] = []
    const first = mutation('server-a', true, () => undefined, () => { calls.push('a'); return serverA.promise })
    const second = mutation('server-b', true, () => undefined, () => { calls.push('b'); return serverB.promise })
    await Promise.resolve()
    expect(calls).toEqual(['a', 'b'])
    serverA.resolve()
    serverB.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
  })

  it('reapplies a newer optimistic intent after an older success refetches stale data', async () => {
    const firstWrite = deferred()
    const refresh = deferred()
    let visible = false
    const apply = (value: boolean) => { visible = value }
    const first = runFavoriteMutation({
      serverId: 'server-refresh', trackId: 'track-1', favorite: true, initialFavorite: false,
      isCurrent: () => true, apply, execute: () => firstWrite.promise,
      afterSuccess: () => refresh.promise,
    })
    const second = runFavoriteMutation({
      serverId: 'server-refresh', trackId: 'track-1', favorite: false, initialFavorite: true,
      isCurrent: () => true, apply, execute: async () => undefined, afterSuccess: async () => undefined,
    })

    firstWrite.resolve()
    await Promise.resolve()
    await Promise.resolve()
    visible = true // Simulate the older invalidation replacing the newer optimistic cache value.
    refresh.resolve()
    await expect(first).resolves.toBe(true)
    expect(visible).toBe(false)
    await expect(second).resolves.toBe(false)
    expect(visible).toBe(false)
  })

  it('stale session completion does not roll back or report a favorite result', async () => {
    const pending = deferred()
    let current = true
    const applied: boolean[] = []
    const result = mutation('server-a', true, (value) => applied.push(value), () => pending.promise, () => current)
    const observed = result.catch((error: unknown) => error)
    current = false
    pending.resolve()
    await expect(observed).resolves.toBeInstanceOf(FavoriteMutationCancelledError)
    expect(applied).toEqual([true])
  })

  it('patches only matching server track-list caches and avoids cross-server player duplicates', () => {
    expect(isTrackQueryForServer(['album-tracks', 'server-a', 'album'], 'server-a')).toBe(true)
    for (const root of ['tracks', 'recent-tracks', 'history', 'search-all-tracks']) {
      expect(isTrackQueryForServer([root, 'server-a'], 'server-a')).toBe(true)
      expect(isTrackQueryForServer([root, 'server-b'], 'server-a')).toBe(false)
    }
    expect(isTrackQueryForServer(['artists', 'server-a'], 'server-a')).toBe(false)
    expect(isTrackQueryForServer(['home', 'recent-tracks', 'server-a'], 'server-a')).toBe(true)
    expect(isTrackQueryForServer(['home', 'recent-albums', 'server-a'], 'server-a')).toBe(false)

    const data = { pages: [{ items: [{ id: 'track-1', isFavorite: false }, { id: 'track-2' }] }] }
    expect(patchTrackQueryData(data, 'track-1', true)).toEqual({
      pages: [{ items: [{ id: 'track-1', isFavorite: true }, { id: 'track-2' }] }],
    })
    expect(canPatchPlayerTrack({
      queue: [{ trackId: 'track-1', serverId: 'server-a' }],
      history: [{ trackId: 'track-1', serverId: 'server-b' }], baseQueue: [],
    }, 'server-a', 'track-1')).toBe(false)
    expect(canPatchPlayerTrack({
      queue: [{ trackId: 'track-1', serverId: 'server-a' }], history: [], baseQueue: [],
    }, 'server-a', 'track-1')).toBe(true)
  })
})
