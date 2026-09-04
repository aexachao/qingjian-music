import { QueryClient } from '@tanstack/react-query'
import { isMusicError } from '@qj/core-domain'

/** 只对网络抖动类错误重试；鉴权/参数错误立即失败，避免刷爆 NAS */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => isMusicError(error) && error.retryable && failureCount < 2,
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
})
