import type { Track } from '@qj/core-domain'
import { TrackMenuButton } from '@/components/track-menu-button'

interface TrackMoreButtonProps {
  track: Track
  onMenuOpenChange?: (open: boolean) => void
}

/**
 * 歌曲快捷菜单按键（「···」+ 系统原生弹窗）。
 *
 * 一期 B1 起，条目定义与动作派发都收敛到 `useTrackMenu`（`lib/use-track-menu.ts`），
 * 这里只把领域曲目翻译成菜单需要的 subject。
 * 之前这套菜单和播放页那套是两份独立实现，导致「添加到歌单」在播放页一直是假 toast。
 */
export function TrackMoreButton({ track, onMenuOpenChange }: TrackMoreButtonProps) {
  const artistText = track.artists.map((a) => a.name).join(' / ') || '未知艺术家'

  return (
    <TrackMenuButton
      context="list"
      onMenuOpenChange={onMenuOpenChange}
      subject={{
        trackId: track.id,
        title: track.title,
        artistText,
        ...(track.album?.id ? { albumId: track.album.id } : {}),
        ...(track.album?.name ? { albumText: track.album.name } : {}),
        ...(track.artists[0]?.id ? { artistId: track.artists[0].id } : {}),
        durationMs: track.durationMs,
        ...(track.isFavorite === undefined ? {} : { isFavorite: track.isFavorite }),
        // 列表上下文需要完整曲目，用于「下一首播放 / 加入队列」
        track,
      }}
    />
  )
}
