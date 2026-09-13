import { useMemo } from 'react'
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query'
import { nextPageNumber, type Page } from '@qj/core-domain'

/**
 * 分页列表的统一封装：所有音乐库列表都用它，避免每个页面重复写 useInfiniteQuery。
 */
export function usePagedQuery<T>(options: {
  queryKey: QueryKey
  enabled: boolean
  fetchPage: (page: number) => Promise<Page<T>>
  size?: number
}) {
  const query = useInfiniteQuery({
    queryKey: options.queryKey,
    enabled: options.enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => options.fetchPage(pageParam),
    getNextPageParam: (lastPage) => nextPageNumber(lastPage),
  })

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const total = query.data?.pages[0]?.total ?? 0

  return {
    query,
    items,
    total,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    },
  }
}
