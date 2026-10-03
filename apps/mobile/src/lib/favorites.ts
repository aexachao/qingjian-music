import { useCallback, useLayoutEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useServerSession } from './server-session'
import { canPatchPlayerTrack, isTrackQueryForServer, patchTrackQueryData, runFavoriteMutation } from './favorite-mutation'
import { usePlayerStore } from '@/player/store'

/** Favorite state is optimistic locally and committed in order for each server/track pair. */
export function useToggleFavorite() {
  const { provider, connection } = useServerSession()
  const queryClient = useQueryClient()
  const sessionRef = useRef({ provider, connectionId: connection?.id })
  useLayoutEffect(() => {
    sessionRef.current = { provider, connectionId: connection?.id }
    return () => { sessionRef.current = { provider: null, connectionId: undefined } }
  }, [provider, connection?.id])

  return useCallback(
    async (trackId: string, favorite: boolean): Promise<boolean> => {
      const serverId = connection?.id
      const activeProvider = provider
      if (!activeProvider?.setFavorite || !serverId) throw new Error('当前服务器不支持收藏')

      const isCurrent = () =>
        sessionRef.current.provider === activeProvider && sessionRef.current.connectionId === serverId

      const apply = (value: boolean) => {
        const player = usePlayerStore.getState()
        if (canPatchPlayerTrack(player, serverId, trackId)) {
          player.patchItem(trackId, { isFavorite: value })
        }
        queryClient.setQueriesData(
          { predicate: (query) => isTrackQueryForServer(query.queryKey, serverId) },
          (data) => patchTrackQueryData(data, trackId, value),
        )
      }

      return runFavoriteMutation({
        serverId,
        trackId,
        favorite,
        initialFavorite: !favorite,
        isCurrent,
        apply,
        execute: () => activeProvider.setFavorite!(trackId, favorite),
        afterSuccess: async () => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['favorites', serverId] }),
            queryClient.invalidateQueries({ queryKey: ['home', 'favorites-count', serverId] }),
          ])
        },
      })
    },
    [provider, connection?.id, queryClient],
  )
}
