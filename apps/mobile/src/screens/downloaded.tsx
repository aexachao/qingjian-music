import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { LivePlayingBars } from '@/components/playing-bars'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { CoverImage } from '@/components/cover-image'
import { Icon, iconSize } from '@/components/icon'
import { EmptyState } from '@/components/list-states'
import { useConfirm } from '@/components/confirm-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useServerSession } from '@/lib/server-session'
import { formatBytes } from '@/player/audio-cache-policy'
import {
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
  const current = usePlayerStore(selectCurrent)
  const toast = useToast()
  const confirm = useConfirm()
  const { provider, connection } = useServerSession()

  // 登记表一变就重读快照（下载完成、删除都要立刻反映到列表与汇总）
  const [entries, setEntries] = useState<DownloadEntry[]>(() => listDownloads())
  useEffect(() => subscribeDownloads(() => setEntries(listDownloads())), [])
  const visibleEntries = useMemo(
    () => (connection ? entries.filter((entry) => entry.serverId === connection.id) : []),
    [connection, entries],
  )
  const stats = useMemo(
    () => ({ count: visibleEntries.length, bytes: visibleEntries.reduce((sum, entry) => sum + entry.bytes, 0) }),
    [visibleEntries],
  )

  const playFrom = useCallback(
    (entry: DownloadEntry) => {
      if (!provider || !connection) return
      // 只拿有完整曲目的那些来组队列（老版本登记项可能没存 track）
      const playable = visibleEntries.filter((item) => item.track)
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
    [connection, provider, toast, visibleEntries],
  )

  const onRemove = useCallback(
    (entry: DownloadEntry) => {
      try {
        removeDownload(entry.key)
        toast('已删除下载')
      } catch (error) {
        toast(error instanceof Error ? error.message : '删除失败，请稍后重试')
      }
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
        try {
          for (const entry of visibleEntries) removeDownload(entry.key)
          toast('已删除当前服务器的全部下载')
        } catch (error) {
          toast(error instanceof Error ? error.message : '部分下载未能删除，请稍后重试')
        }
      },
    })
  }, [confirm, stats.count, toast, visibleEntries])

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
        data={visibleEntries}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        renderItem={({ item }) => {
          const playing = current?.serverId === item.serverId && current?.trackId === item.trackId
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => playFrom(item)}
                accessibilityRole="button"
                accessibilityLabel={`${playing ? '正在播放' : '播放'} ${item.title}`}
                accessibilityState={{ selected: playing }}
              >
                <CoverImage coverId={item.coverId} size={48} borderRadius={radius.sm} />
                <View style={styles.rowText}>
                  <View style={styles.titleRow}>
                    {playing ? <LivePlayingBars size={11} /> : null}
                    <Text numberOfLines={1} style={[styles.title, playing && styles.playing]}>
                      {item.title}
                    </Text>
                  </View>
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
          )
        }}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playing: { color: colors.playing },
  title: { ...typography.callout, color: colors.textPrimary, flexShrink: 1 },
  meta: { ...typography.caption, color: colors.textSecondary },
  deleteSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  separator: { height: 1, marginLeft: 60, backgroundColor: colors.borderSubtle },
}))
