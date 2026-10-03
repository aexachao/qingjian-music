import { useCallback, type ReactElement } from 'react'
import { FlatList, Modal, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { PlaySource, Track } from '@qj/core-domain'
import { PlaylistPickerSheet } from '@/components/playlist-picker-sheet'
import { SELECTION_ACTION_BAR_HEIGHT, SelectionActionBar, SelectionToolbarBar } from '@/components/selection-bar'
import { TrackRow } from '@/components/track-row'
import { selectionCountText, selectionState } from '@/lib/selection-policy'
import { useTrackSelection } from '@/lib/use-track-selection'
import { createThemedStyles } from '@/theme/theme-provider'
import { spacing } from '@/theme/tokens'

/**
 * 多选**模态弹窗**。
 *
 * 2026-09-15 的拍板：点工具条上那颗「批量选择」图标 → 弹出这个模态，
 * 选择、全选、批量动作都在弹窗里完成（对齐飞牛的形态：整屏 sheet + 顶部拖动条 +
 * 「已选 N 首 / 完成」+ 底部动作栏）。列表页本身**不进入**什么选择态。
 *
 * 弹窗直接吃宿主列表的 `items`（含分页加载出来的那些），**不另开一套查询** ——
 * 所以分页、排序、缓存都跟列表页是同一份；滚到底继续加载也复用宿主的 `loadMore`。
 */
export interface TrackSelectionModalProps {
  visible: boolean
  items: readonly Track[]
  source: PlaySource
  /** 专辑内用序号，其它列表用封面 —— 与宿主列表保持一致 */
  leading: 'index' | 'cover'
  isPlaying?: (trackId: string) => boolean
  /** 滚到底加载下一页（复用宿主的分页查询） */
  onEndReached: () => void
  /** 宿主的加载更多页脚（把它的 loading / error / retry 一起带过来，避免两套状态） */
  footer: ReactElement
  onClose: () => void
}

export function TrackSelectionModal({
  visible,
  items,
  source,
  leading,
  isPlaying,
  onEndReached,
  footer,
  onClose,
}: TrackSelectionModalProps) {
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const selection = useTrackSelection({ items, source })
  // iOS 的 pageSheet 已经让开了状态栏（sheet 顶部在状态栏下面），所以不要再补顶部内边距；
  // Android 上没有 pageSheet，是全屏模态，得自己让开状态栏。
  const topPadding = Platform.OS === 'ios' ? 0 : insets.top

  // 「完成」/ 下滑关闭：先清掉选中集合，再让宿主把弹窗关掉
  const handleClose = useCallback(() => {
    selection.clear()
    onClose()
  }, [onClose, selection])

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // 走**原生 sheet**（iOS）：顶部留出底层页面、圆角、可下滑关闭 —— 一眼看出是模态，
      // 而不是「顶到最上面像进了二级页」。Android 忽略这个属性（全屏）。
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={handleClose}
    >
      <View style={[styles.root, { paddingTop: topPadding }]}>
        {/* 顶部拖动条：和 App 里其它 sheet 同一套形态 */}
        <View style={styles.handle} />

        <SelectionToolbarBar
          state={selectionState(selection.ids, items.map((item) => item.id))}
          countText={selectionCountText(selection.count)}
          onToggleAll={selection.onToggleAll}
          onDone={handleClose}
        />

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            // 给底部动作栏 + 安全区让位，否则最后几行被盖住
            { paddingBottom: SELECTION_ACTION_BAR_HEIGHT + insets.bottom + spacing.lg },
          ]}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              index={index}
              leading={leading}
              playing={isPlaying?.(item.id) ?? false}
              selection={{ selected: selection.isSelected(item.id), onToggle: () => selection.toggle(item.id) }}
            />
          )}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={footer}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />

        <SelectionActionBar
          count={selection.count}
          onPlay={selection.playSelected}
          onAppend={selection.appendSelected}
          onAddToPlaylist={selection.openPlaylistPicker}
          onDownload={selection.downloadSelected}
        />

        <PlaylistPickerSheet
          visible={selection.playlistPickerVisible}
          trackIds={selection.ids}
          onClose={selection.closePlaylistPicker}
        />
      </View>
    </Modal>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSelected,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  separator: { height: 1, marginLeft: 60, backgroundColor: colors.borderSubtle },
}))
