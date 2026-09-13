import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
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
import { audioCacheStats, clearAudioCache } from '@/player/audio-cache'
import { formatBytes } from '@/player/audio-cache-policy'
import { clearLyricCache, lyricCacheStats } from '@/lib/lyric-cache'
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

  const [audioCache, setAudioCache] = useState(() => audioCacheStats())
  const [lyricCache, setLyricCache] = useState(() => lyricCacheStats())
  const [modalType, setModalType] = useState<'size' | 'count' | null>(null)

  const currentSizeOption = CACHE_SIZE_OPTIONS.find((item) => item.key === sizeLimitKey)
  const currentCountOption = CACHE_COUNT_OPTIONS.find((item) => item.key === countLimitKey)

  const onClearAudio = () => {
    if (audioCache.files === 0 && audioCache.bytes === 0) {
      toast('当前本地没有音频缓存')
      return
    }
    confirm({
      title: '清理歌曲缓存',
      message: `确定要清空本地已缓存的 ${audioCache.files} 首歌曲（共 ${formatBytes(audioCache.bytes)}）吗？清空后若需收听将重新从服务器拉取。`,
      confirmText: '确定清理',
      destructive: true,
      onConfirm: () => {
        clearAudioCache()
        setAudioCache(audioCacheStats())
        toast('本地歌曲缓存已全部清除')
      },
    })
  }

  const onClearArtwork = () => {
    confirm({
      title: '清理封面缓存',
      message: '确定要清除所有已缓存的专辑与艺术家封面缩略图吗？',
      confirmText: '确定清理',
      destructive: true,
      onConfirm: () => {
        clearArtworkCache()
        toast('封面图片缓存已清除')
      },
    })
  }

  const onClearLyrics = () => {
    if (lyricCache.files === 0) {
      toast('当前本地没有歌词缓存')
      return
    }
    confirm({
      title: '清理歌词缓存',
      message: `确定要清除本地已缓存的 ${lyricCache.files} 首歌的歌词吗？清除后再次查看会重新从服务器获取。`,
      confirmText: '确定清理',
      destructive: true,
      onConfirm: () => {
        clearLyricCache()
        setLyricCache(lyricCacheStats())
        toast('歌词缓存已清除')
      },
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
          <Text style={styles.sectionHeader}>自动缓存</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.rowTitle}>自动缓存播放中的歌曲</Text>
                <Text style={styles.rowSubtitle}>
                  边听边存，下一次播放即开即播
                </Text>
              </View>
              <Switch
                value={autoCacheEnabled}
                onValueChange={setAutoCacheEnabled}
                trackColor={{ false: colors.bgCardHover, true: colors.accent }}
                thumbColor={colors.textOnAccent}
              />
            </View>
          </View>
          <Text style={styles.sectionFooter}>
            开启后，播放过的歌曲将自动缓存在本机，在弱网或离线无网络时依然可流畅播放。
          </Text>
        </View>

        {/* Section 2: 缓存上限设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>缓存配额控制</Text>
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.clickableRow, pressed && styles.rowPressed]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setModalType('size')
              }}
              accessibilityRole="button"
              accessibilityLabel="设置缓存容量上限"
            >
              <Text style={styles.rowTitle}>缓存容量上限</Text>
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
              accessibilityLabel="设置缓存歌曲数量上限"
            >
              <Text style={styles.rowTitle}>缓存歌曲数量上限</Text>
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{currentCountOption?.label ?? '无限制'}</Text>
                <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
              </View>
            </Pressable>
          </View>
          <Text style={styles.sectionFooter}>
            达到容量上限或首数上限后，系统将依据最近最少使用规则（LRU）自动淘汰最早收听的歌曲。
          </Text>
        </View>

        {/* Section 3: 空间占用与清理 */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>存储占用与清理</Text>
          <View style={styles.card}>
            {/* 歌曲音频缓存 */}
            <View style={styles.actionRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.rowTitle}>歌曲音频缓存</Text>
                <Text style={styles.rowSubtitle}>
                  {audioCache.files} 首歌曲 · {formatBytes(audioCache.bytes)}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
                onPress={onClearAudio}
                accessibilityRole="button"
                accessibilityLabel="清理歌曲缓存"
              >
                <Text style={styles.clearButtonText}>清理</Text>
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
                style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
                onPress={onClearArtwork}
                accessibilityRole="button"
                accessibilityLabel="清理封面缓存"
              >
                <Text style={styles.clearButtonText}>清理</Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* 歌词缓存：本地命中的歌词不再请求服务端，断网也能显示 */}
            <View style={styles.actionRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.rowTitle}>歌词缓存</Text>
                <Text style={styles.rowSubtitle}>
                  {lyricCache.files > 0 ? `已缓存 ${lyricCache.files} 首` : '暂无缓存'}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
                onPress={onClearLyrics}
                accessibilityRole="button"
                accessibilityLabel="清理歌词缓存"
              >
                <Text style={styles.clearButtonText}>清理</Text>
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
        title="缓存容量上限"
        options={SIZE_ITEMS}
        selectedKey={sizeLimitKey}
        onSelect={(key) => setSizeLimitKey(key)}
        onClose={() => setModalType(null)}
      />

      {/* 缓存首数上限选择弹窗 */}
      <OptionPickerModal<CacheCountKey>
        visible={modalType === 'count'}
        title="缓存歌曲数量上限"
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
    ...typography.headline,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
    marginBottom: 4,
  },
  sectionFooter: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textTertiary,
    marginLeft: 4,
    marginTop: 4,
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    overflow: 'hidden',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
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
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: colors.bgCardHover,
  },
  rowTitle: {
    ...typography.body,
    fontSize: 16,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textTertiary,
  },
  rowValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    ...typography.subhead,
    fontSize: 15,
    color: colors.textTertiary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    minHeight: 56,
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246, 44, 85, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(246, 44, 85, 0.3)',
  },
  clearButtonPressed: {
    opacity: 0.7,
  },
  clearButtonText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderDefault,
    marginLeft: spacing.lg,
  },
}))
