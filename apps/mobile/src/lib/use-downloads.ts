import { useSyncExternalStore } from 'react'
import { downloadKey } from '@/lib/download-policy'
import { downloadJobStates, isDownloaded, listDownloads, subscribeDownloads } from '@/player/downloads'

/**
 * 下载状态的响应式读取。
 *
 * 菜单条目（`···` 里的「下载 / 删除下载」）必须**跟着状态变**：下完之后再打开菜单
 * 还显示「下载」就是假菜单。所以走 `useSyncExternalStore` 订阅登记表变化，
 * 而不是在渲染时读一次快照。
 */
export function useIsDownloaded(serverId: string | undefined, trackId: string): boolean {
  const key = serverId ? downloadKey(serverId, trackId) : ''
  return useSyncExternalStore(
    subscribeDownloads,
    () => (key.length > 0 ? isDownloaded(serverId as string, trackId) : false),
    () => false,
  )
}

/** 已下载曲目的键集合（列表批量判断用；快照用 join 保证引用稳定） */
export function useDownloadedKeys(): ReadonlySet<string> {
  const joined = useSyncExternalStore(
    subscribeDownloads,
    () => listDownloads().map((entry) => entry.key).join('|'),
    () => '',
  )
  return new Set(joined.length > 0 ? joined.split('|') : [])
}

/** Pending and active jobs expose cancellation through the same track menu. */
export function useIsDownloading(serverId: string | undefined, trackId: string): boolean {
  const key = serverId ? downloadKey(serverId, trackId) : ''
  return useSyncExternalStore(
    subscribeDownloads,
    () => key.length > 0 && downloadJobStates().some((job) => job.key === key && job.state === 'downloading'),
    () => false,
  )
}
