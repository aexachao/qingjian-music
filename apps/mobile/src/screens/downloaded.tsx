import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { EmptyState } from '@/components/list-states'
import { useConfirm } from '@/components/confirm-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { batchDownloadMessage, summarizeBatch } from '@/lib/download-policy'
import { useServerSession } from '@/lib/server-session'
import { formatBytes } from '@/player/audio-cache-policy'
import {
  clearDownloads,
  listDownloads,
  removeDownload,
  subscribeDownloads,
  type DownloadEntry,
} from '@/player/downloads'
import { playTrackList } from '@/player/controller'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/**
 * 下载管理页（第 7 轮）。
 *
 * 这里**只讲下载，不讲缓存** —— 播放缓存是另一套（设置 → 缓存，会被配额自动清），
 * 下载是用户显式要的、不参与淘汰。所以页面上不出现「缓存」字样，删除也只删下载。
 *
 * 订阅登记表变化（`useSyncExternalStore`）：下载完成、删除都要立刻反映到列表与汇总。
 */
export function DownloadedScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const toast = useToast()
  const confirm = useConfirm()
  const { provider, connection } = useServerSession()

  // 登记表一变就重读快照（下载完成、删除都要立刻反映到列表与汇总）
  const [entries, setEntries] = useState<DownloadEntry[]>(() => listDownloads())
  useEffect(() => subscribeDownloads(() => setEntries(listDownloads())), [])
  const stats = useMemo(
    () => ({ count: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) }),
    [entries],
  )

  const playFrom = useCallback(
    (entry: DownloadEntry) => {
      if (!provider || !connection) return
      // 只拿有完整曲目的那些来组队列（老版本登记项可能没存 track）
      const playable = entries.filter((item) => item.track)
      const startIndex = playable.findIndex((item) => item.key === entry.key)
      if (startIndex < 0) {
        toast('这条下载缺少曲目信息，删除后重新下载即可')
        return
      }
      // 播放解析里下载优先（player/controller.ts 先查 downloadedUri），所以这里**离线可播**
      void playTrackList({
        provider,
        serverId: connection.id,
        tracks: playable.map((item) => item.track!),
        startIndex,
        source: { kind: 'tracks', label: '已下载' },
      }).catch(() => toast('播放失败，请稍后再试'))
    },
    [connection, entries, provider, toast],
  )

  const onRemove = useCallback(
    (entry: DownloadEntry) => {
      removeDownload(entry.key)
      toast('已删除下载')
    },
    [toast],
  )

  const onClearAll = useCallback(() => {
    confirm({
      title: '删除全部下载？',
      message: `将删除 ${stats.count} 首歌的本地文件（不影响在线播放）。`,
      confirmText: '全部删除',
      destructive: true,
      onConfirm: () => {
        clearDownloads()
        toast(batchDownloadMessage(summarizeBatch([])).replace('没有可下载的曲目', '已删除全部下载'))
      },
    })
  }, [confirm, stats.count, toast])

  if (stats.count === 0) {
    return <EmptyState text="还没有下载的歌曲。在歌曲的「···」菜单里选「下载」即可离线收听。" />
  }

  return (
    <View style={styles.root}>
      <View style={styles.summary}>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>共 {stats.count} 首</Text>
          <Text style={styles.summaryMeta}>占用本地空间 {formatBytes(stats.bytes)}</Text>
        </View>
        <Pressable
          onPress={onClearAll}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="删除全部下载"
        >
          <Text style={styles.clearAll}>全部删除</Text>
        </Pressable>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              style={styles.rowMain}
              onPress={() => playFrom(item)}
              accessibilityRole="button"
              accessibilityLabel={`播放 ${item.title}`}
            >
              <CoverImage coverId={item.coverId} size={48} borderRadius={radius.sm} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.title}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.meta}>
                  {item.artistText}
                  {item.bytes > 0 ? ` · ${formatBytes(item.bytes)}` : ''}
                </Text>
              </View>
            </Pressable>

            {/* 主触控区与删除按钮是兄弟节点：点删除不会连带播放（队列页那条教训） */}
            <Pressable
              onPress={() => onRemove(item)}
              hitSlop={8}
              style={styles.deleteSlot}
              accessibilityRole="button"
              accessibilityLabel={`删除下载 ${item.title}`}
            >
              <Icon name="trash" size={iconSize.md} color={colors.danger} />
            </Pressable>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  summaryText: { gap: 2 },
  summaryTitle: { ...typography.headline, color: colors.textPrimary },
  summaryMeta: { ...typography.caption, color: colors.textSecondary },
  clearAll: { ...typography.callout, color: colors.danger },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  rowText: { flex: 1, gap: 2 },
  title: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  deleteSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  separator: { height: 1, marginLeft: 60, backgroundColor: colors.borderSubtle },
}))
