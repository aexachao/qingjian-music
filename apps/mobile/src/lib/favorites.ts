import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Track } from '@qj/core-domain'
import { useServerSession } from './server-session'
import { usePlayerStore } from '@/player/store'

/**
 * 收藏开关。飞牛的曲目载荷自带 isFavorite，所以状态直接跟着曲目走：
 * 先乐观更新（队列 + 已缓存的列表），失败再回滚。
 */
export function useToggleFavorite() {
  const { provider, connection } = useServerSession()
  const queryClient = useQueryClient()

  return useCallback(
    async (trackId: string, favorite: boolean): Promise<boolean> => {
      if (!provider?.setFavorite || !connection) return !favorite
      const qid = `${connection.id}:${trackId}`
      const patch = (value: boolean) => {
        usePlayerStore.getState().patchItem(qid, { isFavorite: value })
        // 已经拉下来的列表页同步改，免得返回上一页状态还是旧的
        queryClient.setQueriesData<{ pages?: { items: Track[] }[] }>({ queryKey: [] }, (data) => {
          if (!data?.pages) return data
          let touched = false
          const pages = data.pages.map((page) => {
            if (!page.items?.some((item) => item.id === trackId)) return page
            touched = true
            return {
              ...page,
              items: page.items.map((item) => (item.id === trackId ? { ...item, isFavorite: value } : item)),
            }
          })
          return touched ? { ...data, pages } : data
        })
      }

      patch(favorite)
      try {
        await provider.setFavorite(trackId, favorite)
        await queryClient.invalidateQueries({ queryKey: ['favorites', connection.id] })
        return favorite
      } catch (error) {
        patch(!favorite)
        throw error
      }
    },
    [provider, connection, queryClient],
  )
}
