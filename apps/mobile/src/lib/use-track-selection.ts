import { useCallback, useMemo, useState } from 'react'
import type { PlaySource, Track } from '@qj/core-domain'
import { useToast } from '@/components/toast'
import { isAllSelected, toggleAll, toggleSelected } from '@/lib/selection-policy'
import { useServerSession } from '@/lib/server-session'
import { appendTracks, playTrackList } from '@/player/controller'

/**
 * 曲目列表的「选择态」（多选）控制器。
 *
 * 抽成一个 hook 是因为它有**两个**宿主 —— `screens/track-list-screen.tsx`（7 个列表复用它）
 * 和 `screens/album-detail.tsx`（自带 FlatList，也渲染 `TrackRow`）。选择态的状态机、
 * 批量动作、以及「失败要说失败」的错误处理只写在这里一处，两个宿主都拿到同一套行为。
 *
 * 宿主是 `components/track-selection-modal.tsx`（点工具条那颗「选择」图标弹出来的模态）；
 * 关弹窗时调 `clear()` 清空选中。
 */
export interface TrackSelectionController {
  ids: readonly string[]
  count: number
  /** 选中的曲目，**按列表顺序**（不是点选顺序）—— 批量播放/入队时顺序要跟列表一致 */
  selectedTracks: readonly Track[]
  isSelected: (id: string) => boolean
  allSelected: boolean
  toggle: (id: string) => void
  onToggleAll: () => void
  clear: () => void
  playSelected: () => void
  appendSelected: () => void
  playlistPickerVisible: boolean
  openPlaylistPicker: () => void
  closePlaylistPicker: () => void
}

export function useTrackSelection({
  items,
  source,
}: {
  items: readonly Track[]
  source: PlaySource
}): TrackSelectionController {
  const { provider, connection } = useServerSession()
  const toast = useToast()
  const [ids, setIds] = useState<readonly string[]>([])
  const [playlistPickerVisible, setPlaylistPickerVisible] = useState(false)

  const candidateIds = useMemo(() => items.map((item) => item.id), [items])
  const selectedTracks = useMemo(
    () => items.filter((item) => ids.includes(item.id)),
    [ids, items],
  )
  const allSelected = isAllSelected(ids, candidateIds)

  const clear = useCallback(() => setIds([]), [])
  const toggle = useCallback((id: string) => setIds((previous) => toggleSelected(previous, id)), [])
  const onToggleAll = useCallback(() => setIds((previous) => toggleAll(previous, candidateIds)), [candidateIds])

  const playSelected = useCallback(() => {
    if (!provider || !connection || selectedTracks.length === 0) return
    // 播放失败不静默：捕获后明确告诉用户，并且**留在选择态**让他能重试
    void playTrackList({
      provider,
      serverId: connection.id,
      tracks: [...selectedTracks],
      startIndex: 0,
      source,
    })
      .then(clear)
      .catch(() => toast('播放失败，请稍后再试'))
  }, [clear, connection, provider, selectedTracks, source, toast])

  const appendSelected = useCallback(() => {
    if (!provider || !connection || selectedTracks.length === 0) return
    void appendTracks({ provider, serverId: connection.id, tracks: [...selectedTracks] })
      .then(() => {
        toast(`已加入队列 ${selectedTracks.length} 首`)
        clear()
      })
      .catch(() => toast('加入队列失败，请稍后再试'))
  }, [clear, connection, provider, selectedTracks, toast])

  return {
    ids,
    count: ids.length,
    selectedTracks,
    isSelected: (id: string) => ids.includes(id),
    allSelected,
    toggle,
    onToggleAll,
    clear,
    playSelected,
    appendSelected,
    playlistPickerVisible,
    openPlaylistPicker: useCallback(() => setPlaylistPickerVisible(true), []),
    closePlaylistPicker: useCallback(() => setPlaylistPickerVisible(false), []),
  }
}
