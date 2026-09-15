import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useConfirm } from '@/components/confirm-modal'
import { Icon, IconButton, iconSize, type IconName } from '@/components/icon'
import { EmptyState } from '@/components/list-states'
import { SearchFieldShell } from '@/components/search-field'
import { SegmentedTabs } from '@/components/segmented-tabs'
import { useBottomSpace } from '@/lib/bottom-space'
import { clearRecentSearches, listRecentSearches, pushRecentSearch, removeRecentSearch } from '@/lib/recent-search'
import { buildSuggestionRows, SUGGEST_KIND_LABEL, type SuggestKind } from '@/lib/search-suggestions'
import { clampSearchTabKey, searchTabs, type SearchTabKey } from '@/lib/search-tabs'
import { useServerSession } from '@/lib/server-session'
import { useDebounced } from '@/lib/use-debounced'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'
import { SearchResultList } from './search-result-list'

const SUGGEST_ICON: Record<SuggestKind, IconName> = {
  track: 'tracks',
  album: 'albums',
  artist: 'artists',
  playlist: 'playlists',
}

/**
 * 搜索 · **输入态 + 结果态**（第 9 轮的另外两个状态，同一个路由、内容不同）。
 *
 * 输入框这一行是**页内自绘的顶栏**，不是原生导航栏的 headerTitle —— 曾试过后者，结果是
 * iOS 原生导航栏的 title 区域不给自定义 View 分配宽度：输入框被挤成 0 宽（只剩那颗图标），
 * 而且 header 不在屏幕的视图树里，点不着也拿不到焦点（实测：键盘弹不出来）。
 * 自绘顶栏用安全区自己做顶部内边距，视觉与导航栏同高同位，但宽度与焦点都可控。
 * 所以这一屏是 `headerShown: false`（见 `(tabs)/search/_layout.tsx`）。
 *
 * 「提交」才切到结果态：回车、点联想行、点历史行都算提交。联想只在输入过程中出现 ——
 * 这与第 9 轮"三个状态"的定义一致（输入态给联想，结果态给页签）。
 */
export function SearchQueryScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const { q } = useLocalSearchParams<{ q?: string }>()
  const router = useRouter()
  const confirm = useConfirm()
  const bottom = useBottomSpace()
  const { provider, connection } = useServerSession()
  const inputRef = useRef<TextInput>(null)

  const [input, setInput] = useState(q ?? '')
  /** 已提交的关键词：它决定下面显示联想还是结果 */
  const [committed, setCommitted] = useState((q ?? '').trim())
  const [recent, setRecent] = useState<string[]>([])
  const [tab, setTab] = useState<SearchTabKey>('tracks')

  const typed = input.trim()
  const editing = typed !== committed
  const debounced = useDebounced(typed, 300)

  const canSearchPlaylists = Boolean(provider?.searchPlaylists && provider.capabilities.playlists !== 'none')
  const tabs = useMemo(() => searchTabs({ canSearchPlaylists }), [canSearchPlaylists])
  const activeTab = clampSearchTabKey(tabs, tab)

  const suggestEnabled =
    editing && debounced.length > 0 && Boolean(provider?.capabilities.searchSuggest && provider?.suggest)
  const suggestions = useQuery({
    queryKey: ['search-suggest', connection?.id, debounced],
    enabled: suggestEnabled,
    queryFn: () => provider!.suggest!(debounced),
    staleTime: 60_000,
  })
  const suggestionRows = useMemo(() => buildSuggestionRows(suggestions.data), [suggestions.data])

  // 历史只在进来时读一次；之后的增删都用写入函数的返回值刷 UI，避免多读一次存储
  useEffect(() => {
    let alive = true
    void listRecentSearches().then((list) => {
      if (alive) setRecent(list)
    })
    return () => {
      alive = false
    }
  }, [])

  /**
   * 进这一屏就把焦点给输入框（并弹出键盘）。
   * **不能只靠 `autoFocus`** —— push 转场期间视图还没进 window，实测 autoFocus 不生效
   * （输入框在、键盘不弹）。所以等这一屏真正获得焦点后再补一次 focus()。
   * 带关键词直接落结果页时不抢焦点。
   */
  useFocusEffect(
    useCallback(() => {
      if (committed.length > 0) return
      const timer = setTimeout(() => inputRef.current?.focus(), 320)
      return () => clearTimeout(timer)
    }, [committed]),
  )

  /**
   * 提交一次搜索：写历史 + 收键盘 + 切到结果态。
   * 只在提交时记历史（不跟着输入防抖记）—— 否则「周」「周杰」「周杰伦」会变成三条历史。
   */
  const commitSearch = useCallback((value: string) => {
    const next = value.trim()
    if (!next) return
    setInput(next)
    setCommitted(next)
    Keyboard.dismiss()
    void pushRecentSearch(next).then(setRecent)
  }, [])

  const onCancel = useCallback(() => {
    Keyboard.dismiss()
    router.back()
  }, [router])

  const onRemoveRecent = useCallback((value: string) => {
    void removeRecentSearch(value).then(setRecent)
  }, [])

  const onClearRecent = useCallback(() => {
    confirm({
      title: '清空搜索历史？',
      message: '清空后无法恢复。',
      confirmText: '清空',
      destructive: true,
      onConfirm: () => {
        void clearRecentSearches().then(() => setRecent([]))
      },
    })
  }, [confirm])

  const showResults = !editing && committed.length > 0
  const showSuggestions = !showResults && debounced.length > 0

  return (
    <View style={styles.root}>
      {/* 顶栏：自绘，所以要自己让开安全区；比系统导航栏多留一点上边距（不要贴着状态栏） */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <SearchFieldShell style={styles.flex}>
          <Icon name="search" size={iconSize.sm} color={colors.iconDim} />
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => commitSearch(input)}
            placeholder="搜索歌曲、专辑、艺术家"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            // 光标与选择色走品牌色（默认是系统蓝）
            selectionColor={colors.stateSelected}
            cursorColor={colors.stateSelected}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="搜索曲库"
          />
        </SearchFieldShell>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="取消搜索">
          <Text style={styles.cancel}>取消</Text>
        </Pressable>
      </View>

      {showResults ? (
        <>
          {/* 页签栏常驻：只换下面的列表，自己不随列表滚走 */}
          <View style={styles.tabsBar}>
            <SegmentedTabs
              items={tabs}
              value={activeTab}
              onChange={setTab}
              accessibilityLabel="搜索结果分类"
            />
          </View>
          <SearchResultList type={activeTab} keyword={committed} />
        </>
      ) : showSuggestions ? (
        <FlatList
          data={suggestionRows}
          keyExtractor={(row) => row.key}
          style={styles.flex}
          contentContainerStyle={[styles.suggestBox, { paddingBottom: bottom }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            // 第一行永远是「直接搜这个词」：即使联想没命中，也有一条明确的出口
            <Pressable
              style={styles.suggestRow}
              onPress={() => commitSearch(debounced)}
              accessibilityRole="button"
              accessibilityLabel={`搜索 ${debounced}`}
            >
              <Icon name="search" size={iconSize.md} color={colors.textSecondary} />
              <Text numberOfLines={1} style={styles.suggestLabel}>
                搜索「{debounced}」
              </Text>
            </Pressable>
          }
          ListEmptyComponent={
            suggestions.isError ? <Text style={styles.suggestEmpty}>联想加载失败，直接回车搜索即可</Text> : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.suggestRow}
              onPress={() => commitSearch(item.label)}
              accessibilityRole="button"
              accessibilityLabel={`${SUGGEST_KIND_LABEL[item.kind]} ${item.label}`}
            >
              <Icon name={SUGGEST_ICON[item.kind]} size={iconSize.md} color={colors.textSecondary} />
              <Text numberOfLines={1} style={styles.suggestLabel}>
                {item.label}
              </Text>
              <Text numberOfLines={1} style={styles.suggestHint}>
                {item.hint}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={recent}
          keyExtractor={(item) => item}
          style={styles.flex}
          contentContainerStyle={[styles.historyList, { paddingBottom: bottom }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            recent.length > 0 ? (
              <View style={styles.recentHeader}>
                <Text style={styles.sectionTitle}>最近搜索</Text>
                <Pressable
                  onPress={onClearRecent}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="清空搜索历史"
                >
                  <Text style={styles.recentClear}>清空</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={<EmptyState text="输入关键词，搜索歌曲、专辑、艺术家" />}
          renderItem={({ item }) => (
            <View style={styles.recentRow}>
              <Pressable
                style={styles.recentMain}
                onPress={() => commitSearch(item)}
                accessibilityRole="button"
                accessibilityLabel={`搜索历史 ${item}`}
              >
                <Icon name="history" size={iconSize.md} color={colors.textSecondary} />
                <Text numberOfLines={1} style={styles.recentText}>
                  {item}
                </Text>
              </Pressable>
              <IconButton
                name="close"
                size={iconSize.sm}
                color={colors.iconDim}
                onPress={() => onRemoveRecent(item)}
                accessibilityLabel={`删除搜索历史 ${item}`}
              />
            </View>
          )}
        />
      )}
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  root: { flex: 1 },
  flex: { flex: 1 },
  // 自绘顶栏：与导航栏同高同位（安全区自己做顶部内边距）
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgPrimary,
  },
  input: { flex: 1, ...typography.callout, color: colors.textPrimary, padding: 0 },
  cancel: { ...typography.callout, color: colors.actionText },
  tabsBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  // 同上：空历史时让内容区撑满，空状态在视窗里居中
  historyList: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  recentClear: { ...typography.callout, color: colors.iconMid },
  recentRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  recentText: { flexShrink: 1, ...typography.callout, color: colors.textPrimary },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, paddingVertical: spacing.sm },
  suggestBox: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: 2 },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  suggestLabel: { flexShrink: 1, ...typography.callout, color: colors.textPrimary },
  suggestHint: { flex: 1, ...typography.caption, color: colors.textTertiary, textAlign: 'right' },
  suggestEmpty: { ...typography.caption, color: colors.textTertiary, paddingVertical: spacing.sm },
}))
