import { useCallback, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import ReorderableList, { type ReorderableListReorderEvent } from 'react-native-reorderable-list'
import type { QueueItem } from '@qj/core-domain'
import { Icon, IconButton, iconSize, type IconName } from '@/components/icon'
import { LivePlayingBars } from '@/components/playing-bars'
import { formatDuration } from '@/components/track-row'
import { useServerSession } from '@/lib/server-session'
import {
  cycleRepeat,
  extendWithRadio,
  fillRadio,
  moveInQueue,
  RADIO_UPCOMING_KEEP,
  removeFromQueue,
  setShuffledOrder,
  skipToIndex,
} from '@/player/controller'
import { usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 长按多久开始拖动排序 */
const LONG_PRESS_MS = 280
/** 滚到列表尾部时，再往后补这么多首（漫游是无限流） */
const RADIO_FETCH_MORE = 12

/**
 * 播放页右侧那一页：顶部三个播放模式按钮 + 待播列表。
 * 三个按钮互不冲突，可以同时生效。
 */
export function PlayerQueue({ bottomSpace }: { bottomSpace: number }) {
  const { provider, connection } = useServerSession()
  const queue = usePlayerStore((state) => state.queue)
  const index = usePlayerStore((state) => state.index)
  const playMode = usePlayerStore((state) => state.playMode)
  const autoplay = usePlayerStore((state) => state.autoplay)

  /** 无限播放：打开时如果队尾已经不剩几首，立刻先续上，别等切歌 */
  const onToggleAutoplay = useCallback(() => {
    const next = !autoplay
    usePlayerStore.getState().setAutoplay(next)
    if (!next || !provider || !connection) return
    const state = usePlayerStore.getState()
    if (state.queue.length - state.index - 1 > RADIO_UPCOMING_KEEP) return
    void extendWithRadio(provider, connection.id).catch(() => {
      // 续歌失败不影响当前播放，切歌时还会再试
    })
  }, [autoplay, connection, provider])

  /** 拉取中标志：滚到底触发一次，别在补歌期间反复发请求 */
  const fillingRef = useRef(false)

  /** 列表滚到底：漫游再往后取一段；普通队列开了无限播放就切到漫游续 */
  const onEndReached = useCallback(() => {
    if (!provider || !connection) return
    const { source, index: current, queue: list } = usePlayerStore.getState()
    const upcoming = list.length - current - 1
    if (source?.kind === 'radio') {
      if (fillingRef.current) return
      fillingRef.current = true
      void fillRadio(provider, connection.id, upcoming + RADIO_FETCH_MORE)
        .catch(() => {
          // 补歌失败无所谓，列表已经能往下看
        })
        .finally(() => {
          fillingRef.current = false
        })
    } else if (autoplay && upcoming <= RADIO_UPCOMING_KEEP) {
      void extendWithRadio(provider, connection.id).catch(() => {
        // 同上
      })
    }
  }, [autoplay, connection, provider])

  return (
    <View style={styles.container}>
      <View style={styles.modes}>
        <ModeButton
          icon="shuffle"
          label="随机播放"
          active={playMode.shuffle}
          onPress={() => void setShuffledOrder(!playMode.shuffle)}
        />
        <ModeButton
          icon={playMode.repeat === 'one' ? 'repeatOne' : 'repeat'}
          label={playMode.repeat === 'one' ? '单曲循环' : '列表循环'}
          active={playMode.repeat !== 'off'}
          onPress={() => void cycleRepeat()}
        />
        {/* 无限播放靠服务端的漫游接口续歌，服务端不支持就不出这个按钮 */}
        {provider?.capabilities.radio ? (
          <ModeButton icon="infinity" label="无限播放" active={autoplay} onPress={onToggleAutoplay} />
        ) : null}
      </View>

      <ReorderableList
        data={queue}
        keyExtractor={(item) => item.qid}
        contentContainerStyle={[styles.list, { paddingBottom: bottomSpace }]}
        onReorder={({ from, to }: ReorderableListReorderEvent) => void moveInQueue(from, to)}
        // 漫游/无限播放：滚到底就再补一段，列表永远有得往下翻
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        // 关键：拖动手势要长按之后才生效。默认的 Pan 任何方向一动就抢，
        // 会把外层横向翻页的手势吃掉，导致「滑到播放列表后划不回去」。
        panActivateAfterLongPress={LONG_PRESS_MS}
        renderItem={({ item, index: rowIndex }) => (
          <QueueRow item={item} rowIndex={rowIndex} playing={rowIndex === index} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>队列是空的</Text>}
      />
    </View>
  )
}

/** 播放模式按钮：选中是强调色 + 浅底，未选中是灰图标 */
function ModeButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.mode, active && styles.modeActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `${label}（已开启）` : label}
    >
      <Icon
        name={icon}
        size={iconSize.xl}
        color={active ? colors.bgPrimary : colors.textSecondary}
      />
    </Pressable>
  )
}

function QueueRow({ item, rowIndex, playing }: { item: QueueItem; rowIndex: number; playing: boolean }) {
  return (
    <Pressable
      onPress={() => void skipToIndex(rowIndex)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`播放 ${item.title}，长按可拖动排序`}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          {playing ? <LivePlayingBars size={iconSize.sm} /> : null}
          <Text style={[styles.rowTitle, playing && styles.rowTitleActive]} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.artistText}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowDuration}>{formatDuration(item.durationMs)}</Text>
        {playing ? (
          // 当前播放行只给拖动把手，其余行给移除按钮：二选一，不同时出现
          <View style={styles.dragSlot}>
            <Icon name="drag" size={iconSize.md} color={colors.iconDim} />
          </View>
        ) : (
          <IconButton
            name="close"
            size={iconSize.md}
            color={colors.iconDim}
            onPress={() => void removeFromQueue(rowIndex)}
            accessibilityLabel={`从队列移除 ${item.title}`}
          />
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.sm },
  // 三个按钮等宽撑满一行；图标各占三分之一宽度，视觉上就均匀了
  modes: { flexDirection: 'row', gap: spacing.sm },
  mode: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    // 未开启：浅色底（背景是模糊封面，用半透明白最稳妥）
    backgroundColor: colors.bgButtonSecondary,
  },
  // 开启：背景反白，图标用页面的底色，像被「挖」出来一样
  modeActive: { backgroundColor: colors.textPrimary },
  list: { paddingTop: spacing.xs },
  empty: { ...typography.callout, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    // 列表直接浮在模糊封面上，行不给底色
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowTitle: { ...typography.callout, color: colors.textPrimary, flexShrink: 1 },
  rowTitleActive: { color: colors.playing },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowDuration: { ...typography.caption, color: colors.textTertiary },
  dragSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
