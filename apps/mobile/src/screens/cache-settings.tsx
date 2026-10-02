import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { useConfirm } from '@/components/confirm-modal'
import { Icon, iconSize } from '@/components/icon'
import { OptionPickerModal, type OptionPickerItem } from '@/components/option-picker-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import {
  CACHE_COUNT_OPTIONS,
  CACHE_SIZE_OPTIONS,
  type CacheCountKey,
  type CacheSizeKey,
  useCachePreferences,
} from '@/lib/cache-preferences'
import { clearArtworkCache } from '@/player/artwork'
import { clearAudioCache } from '@/player/audio-cache'
import { abortTranscodeCaching } from '@/player/transcode-cache'
import { formatBytes } from '@/player/audio-cache-policy'
import { clearLyricCache } from '@/lib/lyric-cache'
import { readStorageSnapshot } from '@/lib/storage-stats'
import type { StorageSnapshot } from '@/lib/storage-breakdown'
import { StorageCapacityChart } from '@/components/storage-capacity-chart'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

const SIZE_ITEMS: OptionPickerItem<CacheSizeKey>[] = [
  { key: '512MB', title: '512 MB' },
  { key: '1GB', title: '1 GB' },
  { key: '2GB', title: '2 GB' },
  { key: '5GB', title: '5 GB' },
  { key: '10GB', title: '10 GB' },
  { key: 'unlimited', title: '无限制' },
]

const COUNT_ITEMS: OptionPickerItem<CacheCountKey>[] = [
  { key: '100', title: '100 首' },
  { key: '300', title: '300 首' },
  { key: '500', title: '500 首' },
  { key: '1000', title: '1000 首' },
  { key: 'unlimited', title: '无限制' },
]

export function CacheSettingsScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const confirm = useConfirm()
  const toast = useToast()
  const {
    autoCacheEnabled,
    sizeLimitKey,
    countLimitKey,
    setAutoCacheEnabled,
    setSizeLimitKey,
    setCountLimitKey,
  } = useCachePreferences()

  const [storageSnapshot, setStorageSnapshot] = useState<StorageSnapshot | null>(null)
  const [modalType, setModalType] = useState<'size' | 'count' | null>(null)
  const [clearing, setClearing] = useState<'audio' | 'artwork' | 'lyrics' | null>(null)
  const clearingRef = useRef(false)

  const refreshStorage = useCallback(() => {
    setStorageSnapshot(readStorageSnapshot())
  }, [])

  useFocusEffect(useCallback(() => {
    refreshStorage()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshStorage()
    })
    return () => subscription.remove()
  }, [refreshStorage]))

  const currentSizeOption = CACHE_SIZE_OPTIONS.find((item) => item.key === sizeLimitKey)
  const currentCountOption = CACHE_COUNT_OPTIONS.find((item) => item.key === countLimitKey)
  const audioCountText = storageSnapshot?.audioCacheFiles === null || storageSnapshot?.audioCacheFiles === undefined
    ? '歌曲数量未知'
    : `${storageSnapshot.audioCacheFiles} 首歌曲`
  const lyricCount = storageSnapshot?.lyricCacheFiles
  const lyricCountText = lyricCount === null || lyricCount === undefined
    ? '歌词缓存数量未知'
    : lyricCount > 0 ? `已缓存 ${lyricCount} 首` : '暂无缓存'

  const onClearAudio = () => {
    if (clearingRef.current) return
    clearingRef.current = true
    confirm({
      title: '清理歌曲缓存',
      message: `将清除本地歌曲缓存（${audioCountText}，${storageSnapshot?.audioCacheBytes === null || storageSnapshot?.audioCacheBytes === undefined ? '大小未知' : formatBytes(storageSnapshot.audioCacheBytes)}）。之后播放时会重新从服务器获取。`,
      confirmText: '清理',
      destructive: true,
      onConfirm: () => {
        setClearing('audio')
        try {
          abortTranscodeCaching()
          const success = clearAudioCache()
          refreshStorage()
          toast(success ? '本地歌曲缓存已全部清除' : '部分歌曲缓存未能删除，请稍后重试')
        } catch {
          toast('清理失败，请稍后重试')
        } finally {
          setClearing(null)
          clearingRef.current = false
        }
      },
      onCancel: () => { clearingRef.current = false },
    })
  }

  const onClearArtwork = () => {
    if (clearingRef.current) return
    clearingRef.current = true
    confirm({
      title: '清理封面缓存',
      message: '将清除已缓存的专辑封面与艺术家头像。',
      confirmText: '清理',
      destructive: true,
      onConfirm: async () => {
        setClearing('artwork')
        try {
          const localCleared = clearArtworkCache()
          const imageResults = await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()])
          const imageCleared = imageResults.every((result) => result.status === 'fulfilled' && result.value !== false)
          refreshStorage()
          toast(localCleared && imageCleared ? '封面图片缓存已清除' : '部分封面缓存未能清除，请稍后重试')
        } catch {
          toast('清理失败，请稍后重试')
        } finally {
          setClearing(null)
          clearingRef.current = false
        }
      },
      onCancel: () => { clearingRef.current = false },
    })
  }

  const onClearLyrics = () => {
    if (clearingRef.current) return
    clearingRef.current = true
    confirm({
      title: '清理歌词缓存',
      message: `${lyricCount === null || lyricCount === undefined
        ? '将清除本地歌词缓存。'
        : lyricCount > 0
          ? `将清除本地歌词缓存（${lyricCount} 首）。`
          : '将清除本地歌词缓存。'}之后再次查看时会重新从服务器获取。`,
      confirmText: '清理',
      destructive: true,
      onConfirm: () => {
        setClearing('lyrics')
        try {
          const result = clearLyricCache()
          refreshStorage()
          toast(result.success ? '歌词缓存已清除' : `歌词缓存部分清除失败，剩余 ${result.remaining} 个文件`)
        } catch {
          toast('清理失败，请稍后重试')
        } finally {
          setClearing(null)
          clearingRef.current = false
        }
      },
      onCancel: () => { clearingRef.current = false },
    })
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: 自动缓存开关 */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionHeader}>自动缓存</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.rowTitle}>自动缓存歌曲</Text>
              </View>
              <Switch
                value={autoCacheEnabled}
                onValueChange={setAutoCacheEnabled}
                trackColor={{ false: colors.bgCardHover, true: colors.stateSelected }}
                thumbColor={colors.textOnAccent}
              />
            </View>
          </View>
          <Text style={styles.sectionFooter}>
            播放过的歌曲会保留在本机，便于网络不佳或离线时收听。
          </Text>
        </View>

        {/* Section 2: 缓存上限设置 */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionHeader}>缓存上限</Text>
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.clickableRow, pressed && styles.rowPressed]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setModalType('size')
              }}
              accessibilityRole="button"
              accessibilityLabel="设置容量上限"
            >
              <Text style={styles.rowTitle}>容量上限</Text>
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{currentSizeOption?.label ?? '2 GB'}</Text>
                <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
              </View>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={({ pressed }) => [styles.clickableRow, pressed && styles.rowPressed]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setModalType('count')
              }}
              accessibilityRole="button"
              accessibilityLabel="设置歌曲数量上限"
            >
              <Text style={styles.rowTitle}>歌曲数量上限</Text>
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{currentCountOption?.label ?? '无限制'}</Text>
                <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
              </View>
            </Pressable>
          </View>
          <Text style={styles.sectionFooter}>
            达到任一上限时，自动清理较久未播放的缓存歌曲。
          </Text>
        </View>

        {/* 设备容量概览 */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionHeader}>设备存储</Text>
          <View style={styles.card}>
            <StorageCapacityChart snapshot={storageSnapshot} />
          </View>
        </View>

        {/* 各类应用缓存清理 */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionHeader}>清理缓存</Text>
          <View style={styles.card}>
            {/* 歌曲音频缓存 */}
            <View style={styles.actionRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.rowTitle}>歌曲音频缓存</Text>
                <Text style={styles.rowSubtitle}>
                  {audioCountText} · {storageSnapshot?.audioCacheBytes === null || storageSnapshot?.audioCacheBytes === undefined ? '大小未知' : formatBytes(storageSnapshot.audioCacheBytes)}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.clearButton,
                  pressed && styles.clearButtonPressed,
                  clearing !== null && styles.clearButtonDisabled,
                ]}
                onPress={onClearAudio}
                disabled={clearing !== null}
                accessibilityState={{ disabled: clearing !== null, busy: clearing === 'audio' }}
                accessibilityRole="button"
                accessibilityLabel="清理歌曲缓存"
              >
                {clearing === 'audio' ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={styles.clearButtonText}>清理</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* 封面图片缓存 */}
            <View style={styles.actionRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.rowTitle}>封面图片缓存</Text>
                <Text style={styles.rowSubtitle}>专辑封面与艺术家头像</Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.clearButton,
                  pressed && styles.clearButtonPressed,
                  clearing !== null && styles.clearButtonDisabled,
                ]}
                onPress={onClearArtwork}
                disabled={clearing !== null}
                accessibilityState={{ disabled: clearing !== null, busy: clearing === 'artwork' }}
                accessibilityRole="button"
                accessibilityLabel="清理封面缓存"
              >
                {clearing === 'artwork' ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={styles.clearButtonText}>清理</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* 歌词缓存：本地命中的歌词不再请求服务端，断网也能显示 */}
            <View style={styles.actionRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.rowTitle}>歌词缓存</Text>
                <Text style={styles.rowSubtitle}>
                  {lyricCountText}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.clearButton,
                  pressed && styles.clearButtonPressed,
                  clearing !== null && styles.clearButtonDisabled,
                ]}
                onPress={onClearLyrics}
                disabled={clearing !== null}
                accessibilityState={{ disabled: clearing !== null, busy: clearing === 'lyrics' }}
                accessibilityRole="button"
                accessibilityLabel="清理歌词缓存"
              >
                {clearing === 'lyrics' ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={styles.clearButtonText}>清理</Text>
                )}
              </Pressable>
            </View>
          </View>
          <Text style={styles.sectionFooter}>
            清理缓存不会删除你在飞牛 NAS 上的任何原始媒体文件。
          </Text>
        </View>
      </ScrollView>

      {/* 缓存容量上限选择弹窗 */}
      <OptionPickerModal<CacheSizeKey>
        visible={modalType === 'size'}
        title="容量上限"
        options={SIZE_ITEMS}
        selectedKey={sizeLimitKey}
        onSelect={(key) => setSizeLimitKey(key)}
        onClose={() => setModalType(null)}
      />

      {/* 缓存首数上限选择弹窗 */}
      <OptionPickerModal<CacheCountKey>
        visible={modalType === 'count'}
        title="歌曲数量上限"
        options={COUNT_ITEMS}
        selectedKey={countLimitKey}
        onSelect={(key) => setCountLimitKey(key)}
        onClose={() => setModalType(null)}
      />
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.textTertiary,
    marginLeft: 4,
    marginBottom: 4,
  },
  sectionFooter: {
    ...typography.footnote,
    color: colors.textTertiary,
    marginLeft: 4,
    marginTop: 4,
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    minHeight: 56,
  },
  switchTextCol: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  clickableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: colors.bgCardHover,
  },
  rowTitle: {
    ...typography.callout,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  rowValueContainer: {
    flexDirection: 'row',
    marginLeft: 'auto',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    ...typography.subhead,
    color: colors.textTertiary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    minHeight: 56,
  },
  clearButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: spacing.md,
  },
  clearButtonPressed: {
    opacity: 0.5,
  },
  clearButtonDisabled: {
    opacity: 0.4,
  },
  clearButtonText: {
    ...typography.subhead,
    color: colors.danger,
    fontWeight: '500',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderDefault,
    marginLeft: spacing.lg,
  },
}))
