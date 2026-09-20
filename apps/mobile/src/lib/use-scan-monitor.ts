import { useQuery } from '@tanstack/react-query'
import { useServerSession } from '@/lib/server-session'
import { hasActiveScan } from '@/lib/scan-progress-policy'

/** 轮询间隔：只在有扫描任务在跑时用 */
const POLL_MS = 2500

/**
 * 曲库扫描的共享状态（admin 判定 + 音乐库 + 后台任务）。
 *
 * 首页的「正在扫描」图标和曲库管理页都用这个 hook。三个 query 用固定 key，
 * react-query 会去重并共享缓存 —— 所以在管理页触发扫描后，任务立刻进缓存，
 * 首页图标能马上感知；扫描完成（任务 done）→ 无活跃扫描 → 停止轮询、图标消失。
 *
 * 扫描相关的一切只给 admin：非 admin 时 libraries/tasks 都 disabled（连请求都不发）。
 */
export function useScanMonitor() {
  const { provider, connection } = useServerSession()

  const me = useQuery({
    queryKey: ['me', connection?.id],
    enabled: Boolean(provider),
    queryFn: () => provider!.currentUser(),
    staleTime: 10 * 60_000,
  })
  const isAdmin = me.data?.isAdmin === true

  const libraries = useQuery({
    queryKey: ['music-libraries', connection?.id],
    enabled: Boolean(provider?.musicLibraries) && isAdmin,
    queryFn: () => provider!.musicLibraries!(),
  })

  const tasks = useQuery({
    queryKey: ['background-tasks', connection?.id],
    enabled: Boolean(provider?.backgroundTasks) && isAdmin,
    queryFn: () => provider!.backgroundTasks!(),
    // 有扫描在跑才轮询；空闲时只在挂载/手动刷新时取一次
    refetchInterval: (query) => (hasActiveScan(query.state.data ?? []) ? POLL_MS : false),
  })

  const active = hasActiveScan(tasks.data ?? [])

  return { provider, connection, me, isAdmin, libraries, tasks, active }
}
