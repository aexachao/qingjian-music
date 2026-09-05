import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, Stack, useRouter } from 'expo-router'
import ReorderableList, { useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list'
import type { QueueItem } from '@qj/core-domain'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { LivePlayingBars } from '@/components/playing-bars'
import { formatDuration } from '@/components/track-row'
import { useBottomSpace } from '@/lib/bottom-space'
import { clearQueue, moveInQueue, removeFromQueue, skipToIndex } from '@/player/controller'
import { usePlayerStore } from '@/player/store'
import { colors, spacing, typography } from '@/theme/tokens'

/**
 * 播放队列页：点行跳播、长按拖动排序、行尾图标移除。
 * 导航栏用原生的（和资料库里的详情页同一种样式），来源行放在列表顶部。
 */
export function QueueScreen() {
  const router = useRouter()
  const queue = usePlayerStore((state) => state.queue)
  const index = usePlayerStore((state) => state.index)
  const source = usePlayerStore((state) => state.source)
  const bottom = useBottomSpace()

  const sourceHref =
    source?.id && source.kind === 'album'
      ? ({ pathname: '/library/album/[id]', params: { id: source.id } } as const)
      : source?.id && source.kind === 'artist'
        ? ({ pathname: '/library/artist/[id]', params: { id: source.id } } as const)
        : source?.id && source.kind === 'genre'
          ? ({ pathname: '/library/genre/[id]', params: { id: source.id, name: '' } } as const)
          : source?.id && source.kind === 'playlist'
            ? ({ pathname: '/library/playlist/[id]', params: { id: source.id, name: '' } } as const)
            : null

  const sourceText = `${source?.label ?? '正在播放'} · ${queue.length} 首`
  const sourceRow = sourceHref ? (
    // 有来源可跳时整行可点，右侧箭头是「进来源页」的信号
    <Link href={sourceHref} asChild>
      <Pressable
        style={styles.sourceRow}
        accessibilityRole="button"
        accessibilityLabel={`查看来源：${source?.label ?? ''}`}
      >
        <Text numberOfLines={1} style={styles.sourceText}>
          {sourceText}
        </Text>
        <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
      </Pressable>
    </Link>
  ) : (
    <View style={styles.sourceRow}>
      <Text numberOfLines={1} style={styles.sourceText}>
        {sourceText}
      </Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() =>
                Alert.alert('清空队列', '会停止播放并清空当前列表。', [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '清空',
                    style: 'destructive',
                    onPress: () => {
                      void clearQueue()
                      router.back()
                    },
                  },
                ])
              }
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="清空队列"
            >
              {/* 破坏性操作保留中文文字按钮，不用图标 */}
              <Text style={styles.clear}>清空</Text>
            </Pressable>
          ),
        }}
      />
      <ReorderableList
        data={queue}
        keyExtractor={(item) => item.qid}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        onReorder={({ from, to }: ReorderableListReorderEvent) => void moveInQueue(from, to)}
        renderItem={({ item, index: rowIndex }) => (
          <QueueRow item={item} rowIndex={rowIndex} playing={rowIndex === index} />
        )}
        ListHeaderComponent={sourceRow}
        ListEmptyComponent={<Text style={styles.empty}>队列是空的</Text>}
      />
    </View>
  )
}

function QueueRow({ item, rowIndex, playing }: { item: QueueItem; rowIndex: number; playing: boolean }) {
  const drag = useReorderableDrag()

  return (
    <Pressable
      onPress={() => void skipToIndex(rowIndex)}
      onLongPress={drag}
      delayLongPress={200}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`播放 ${item.title}，长按可拖动排序`}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          {/* 正在播放的标记：跳动的律动条，暂停时停住 */}
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
          // 当前播放行只给拖动把手（长按整行拖动），其余行给移除按钮：二选一，不同时出现
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
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  clear: { ...typography.footnote, color: colors.accent },
  /** 来源行：列表第一行，点了进来源的二级页面 */
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 44,
  },
  sourceText: { ...typography.footnote, color: colors.textTertiary, flexShrink: 1 },
  list: { paddingHorizontal: spacing.lg },
  empty: { ...typography.callout, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // 固定最小高度：让「拖动把手行」和「移除按钮行」等高，拖动排序时不会跳
    minHeight: 56,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPrimary,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowTitle: { ...typography.callout, color: colors.textPrimary, flexShrink: 1 },
  rowTitleActive: { color: colors.playing },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowDuration: { ...typography.caption, color: colors.textTertiary },
  /** 把手占位撑到和 IconButton 一样的 44×44，两种状态下时长文字不会左右错位 */
  dragSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
