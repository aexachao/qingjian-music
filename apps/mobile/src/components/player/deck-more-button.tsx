import type { QueueItem } from '@qj/core-domain'
import { TrackMenuButton } from '@/components/track-menu-button'

/**
 * 「···」按钮 + 系统原生快捷菜单 (iOS: UIContextMenu / Android: PopupMenu)。
 */
export function DeckMoreButton({
  current,
  onBeforeOpen,
  onDismissWithAction,
  onMenuOpenChange,
  popDirection = 'up',
}: {
  current: QueueItem
  onBeforeOpen?: () => boolean
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
  popDirection?: 'up' | 'down'
}) {
  return (
    <TrackMenuButton
      variant="iconButton"
      context="current"
      popDirection={popDirection}
      onBeforeOpen={onBeforeOpen}
      onMenuOpenChange={onMenuOpenChange}
      onNavigate={onDismissWithAction}
      accessibilityLabel="更多快捷操作"
      subject={{
        trackId: current.trackId,
        title: current.title,
        artistText: current.artistText,
        ...(current.albumId ? { albumId: current.albumId } : {}),
        ...(current.albumText ? { albumText: current.albumText } : {}),
        ...(current.artistId ? { artistId: current.artistId } : {}),
        durationMs: current.durationMs,
        ...(current.coverId ? { coverId: current.coverId } : {}),
        ...(current.isFavorite === undefined ? {} : { isFavorite: current.isFavorite }),
      }}
    />
  )
}
