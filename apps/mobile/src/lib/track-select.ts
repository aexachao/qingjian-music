import type { Track } from '@qj/core-domain'

/**
 * 本地「精选」曲目挑选（纯逻辑，无网络、无外部依赖）。
 *
 * 以前艺人页的「精选」靠 Last.fm 全网热度排序，现已按「默认只用飞牛、不接外部源」
 * 的决定去掉。这里退回**本地信号**：先收藏、再按原顺序补齐，凑够 maxCount 首。
 * 将来用户填了国内源、或接上本地播放画像，可在此之上再排序。
 */
export function pickFeaturedTracks(localTracks: Track[], maxCount = 5): Track[] {
  if (localTracks.length === 0) return []

  const picked: Track[] = []
  const used = new Set<string>()

  // 1. 收藏优先
  for (const track of localTracks) {
    if (picked.length >= maxCount) break
    if (track.isFavorite && !used.has(track.id)) {
      picked.push(track)
      used.add(track.id)
    }
  }
  // 2. 其余按原顺序补齐
  for (const track of localTracks) {
    if (picked.length >= maxCount) break
    if (!used.has(track.id)) {
      picked.push(track)
      used.add(track.id)
    }
  }
  return picked
}
