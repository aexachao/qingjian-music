import type { Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import { blendWithPrior, buildRoamingQueue, libraryCompositionOf, profileFromLibrary } from '@qj/core-domain'
import { playTrackList } from '@/player/controller'
import { usePlayerStore } from '@/player/store'
import { useTasteProfileStore } from '@/lib/taste-profile-store'

/**
 * 「猜你喜欢 / 本地电台」——用本地口味画像 + 库先验，从曲库里编排一条漫游队列。
 *
 * 冷启动（还没多少行为）时靠库成分先验给出有变化的推荐；随收藏/听完/跳过累积，
 * 画像逐渐主导。全在本地算，不依赖飞牛的漫游接口。
 */

const POOL_PAGE_SIZE = 100
const MAX_POOL_PAGES = 4

/** 取候选池：首页拿 total，再随机取几页凑样本，够代表库的口味倾向即可 */
async function fetchCandidatePool(provider: MusicProvider): Promise<Track[]> {
  const first = await provider.tracks({ page: 1, size: POOL_PAGE_SIZE })
  const pool: Track[] = [...first.items]
  const total = first.total || first.items.length
  const totalPages = Math.max(1, Math.ceil(total / POOL_PAGE_SIZE))
  const wantPages = Math.min(MAX_POOL_PAGES, totalPages)

  const pages = new Set<number>([1])
  let guard = 0
  while (pages.size < wantPages && guard < 50) {
    pages.add(1 + Math.floor(Math.random() * totalPages))
    guard++
  }
  for (const page of pages) {
    if (page === 1) continue
    try {
      const result = await provider.tracks({ page, size: POOL_PAGE_SIZE })
      pool.push(...result.items)
    } catch {
      // 单页失败不影响整体，继续用已拿到的
    }
  }
  return pool
}

/** 生成漫游队列（不播放，供测试/预览用） */
export async function buildLocalRadioQueue(
  provider: MusicProvider,
  serverId: string,
  options: { size?: number } = {},
): Promise<Track[]> {
  const pool = await fetchCandidatePool(provider)
  if (pool.length === 0) return []

  const behavior = useTasteProfileStore.getState().profileOf(serverId)
  const prior = profileFromLibrary(libraryCompositionOf(pool))
  const profile = blendWithPrior(behavior, prior)

  const recentlyPlayedIds = usePlayerStore
    .getState()
    .history.slice(-50)
    .map((item) => item.trackId)

  return buildRoamingQueue(pool, profile, { size: options.size ?? 50, recentlyPlayedIds })
}

/** 生成并开始播放本地电台；返回是否成功起播（库为空时 false） */
export async function playLocalRadio(provider: MusicProvider, serverId: string): Promise<boolean> {
  const tracks = await buildLocalRadioQueue(provider, serverId, { size: 50 })
  if (tracks.length === 0) return false
  await playTrackList({
    provider,
    serverId,
    tracks,
    startIndex: 0,
    source: { kind: 'tracks', label: '猜你喜欢' },
  })
  return true
}
