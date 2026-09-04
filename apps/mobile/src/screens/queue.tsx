import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import ReorderableList, { useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { QueueItem } from '@qj/core-domain'
import { formatDuration } from '@/components/track-row'
import { clearQueue, moveInQueue, removeFromQueue, skipToIndex } from '@/player/controller'
import { usePlayerStore } from '@/player/store'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 播放队列页：点行跳播、长按拖动排序、✕ 移除，顶部可跳回来源 */
export function QueueScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queue = usePlayerStore((state) => state.queue)
  const index = usePlayerStore((state) => state.index)
  const source = usePlayerStore((state) => state.source)

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

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="收起队列">
          <Text style={styles.handle}>▾</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>播放队列</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {source?.label ?? '正在播放'} · {queue.length} 首
          </Text>
        </View>
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
          <Text style={styles.clear}>清空</Text>
        </Pressable>
      </View>

      {sourceHref ? (
        <Link href={sourceHref} asChild>
          <Pressable style={styles.sourceButton} accessibilityRole="button" accessibilityLabel="查看播放来源">
            <Text style={styles.sourceLabel}>查看来源 ›</Text>
          </Pressable>
        </Link>
      ) : null}

      <ReorderableList
        data={queue}
        keyExtractor={(item) => item.qid}
        contentContainerStyle={styles.list}
        onReorder={({ from, to }: ReorderableListReorderEvent) => void moveInQueue(from, to)}
        renderItem={({ item, index: rowIndex }) => (
          <QueueRow item={item} rowIndex={rowIndex} playing={rowIndex === index} />
        )}
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
      <Text style={[styles.rowTitle, playing && styles.rowTitleActive]} numberOfLines={1}>
        {playing ? '♪ ' : ''}
        {item.title}
      </Text>
      <Text style={styles.rowMeta} numberOfLines={1}>
        {item.artistText}
      </Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowDuration}>{formatDuration(item.durationMs)}</Text>
        {playing ? (
          <Text style={styles.handleIcon}>☰</Text>
        ) : (
          <Pressable
            onPress={() => void removeFromQueue(rowIndex)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`从队列移除 ${item.title}`}
          >
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  handle: { fontSize: 22, color: colors.textSecondary, width: 36 },
  title: { ...typography.headline, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textTertiary },
  clear: { ...typography.footnote, color: colors.accent, width: 36, textAlign: 'right' },
  sourceButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  sourceLabel: { ...typography.footnote, color: colors.accent },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  empty: { ...typography.subhead, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  row: {
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(235,235,245,0.08)',
    backgroundColor: colors.background,
  },
  rowTitle: { ...typography.callout, color: colors.text, paddingRight: 76 },
  rowTitleActive: { color: colors.accent },
  rowMeta: { ...typography.caption, color: colors.textSecondary, paddingRight: 76, marginTop: 2 },
  rowRight: { position: 'absolute', right: 0, top: spacing.sm + 2, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowDuration: { ...typography.caption, color: colors.textTertiary },
  handleIcon: { fontSize: 15, color: colors.textTertiary },
  remove: { fontSize: 15, color: colors.textTertiary },
})
