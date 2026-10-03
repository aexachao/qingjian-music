import type { Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import { blendWithPrior, buildRoamingQueue, isMusicError, libraryCompositionOf, profileFromLibrary } from '@qj/core-domain'
import { playTrackList, startRadio } from '@/player/controller'
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

/** Keep selection failures separate from playback failures; never start a second queue after playback fails. */
export async function startHomeRadio(provider: MusicProvider, serverId: string): Promise<void> {
  let tracks: Track[] = []
  let selectionError: unknown
  try {
    tracks = await buildLocalRadioQueue(provider, serverId, { size: 50 })
  } catch (error) {
    selectionError = error
  }
  if (tracks.length > 0) {
    try {
      await playTrackList({ provider, serverId, tracks, startIndex: 0, source: { kind: 'radio', label: '随心漫游' } })
    } catch (error) {
      throw new Error(`漫游播放失败：${radioFailureReason(error)}`)
    }
    return
  }
  if (!provider.radioStart) {
    throw new Error(selectionError ? `漫游选曲失败：${radioFailureReason(selectionError)}` : '曲库中没有可供漫游的歌曲')
  }
  try {
    await startRadio(provider, serverId)
  } catch (error) {
    const localReason = selectionError ? `选曲：${radioFailureReason(selectionError)}；` : ''
    throw new Error(`漫游启动失败（${localReason}服务器漫游：${radioFailureReason(error)}）`)
  }
}

/** Diagnostic text is bounded and contains no request URLs, tokens, or raw response payloads. */
function radioFailureReason(error: unknown): string {
  if (isMusicError(error)) {
    const reasons = {
      unauthorized: '登录已失效，请重新登录', forbidden: '服务器拒绝访问', notFound: '没有找到可播放的歌曲',
      invalidArguments: '服务器不接受请求参数', unsupported: '服务器不支持此操作', network: '网络连接失败',
      timeout: '请求超时', canceled: '操作已取消', protocol: '服务器返回的数据无法识别', server: '服务器内部错误',
    }
    return reasons[error.code]
  }
  if (error instanceof Error && error.name === 'PlaybackNetworkBlocked') return error.message
  return '处理异常，请重试'
}
