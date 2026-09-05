import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { Icon, iconSize, type IconName } from '@/components/icon'
import { useBottomSpace } from '@/lib/bottom-space'
import { useServerSession } from '@/lib/server-session'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** 需要后端支持哪项能力才显示这一行 */
type Requirement = 'favorites' | 'playHistory' | 'genres' | 'playlists'

interface LibraryEntry {
  label: string
  icon: IconName
  /** 字面量联合才能过 expo-router 的类型化路由检查 */
  href:
    | '/library/tracks'
    | '/library/albums'
    | '/library/artists'
    | '/library/genres'
    | '/library/favorites'
    | '/library/history'
    | '/library/playlists'
  requires?: Requirement
}

/**
 * 按「这是什么」分组，而不是把入口平铺成一长条：
 * 第一组是音乐本身的几种属性（歌曲 / 专辑 / 艺术家 / 流派），
 * 第二组是跟“我”有关的东西。领域层的 DEFAULT_BROWSE_NODES 留给 CarPlay 用，
 * 手机上的分组和文案在这里定，改文案不用动领域层。
 */
const GROUPS: readonly { title: string; entries: readonly LibraryEntry[] }[] = [
  {
    title: '音乐库',
    entries: [
      { label: '全部歌曲', icon: 'tracks', href: '/library/tracks' },
      { label: '专辑', icon: 'albums', href: '/library/albums' },
      { label: '艺术家', icon: 'artists', href: '/library/artists' },
      { label: '流派', icon: 'genres', href: '/library/genres', requires: 'genres' },
    ],
  },
  {
    title: '我的音乐',
    entries: [
      { label: '我喜欢的音乐', icon: 'heart', href: '/library/favorites', requires: 'favorites' },
      { label: '最近播放', icon: 'recentlyPlayed', href: '/library/history', requires: 'playHistory' },
      { label: '歌单', icon: 'playlists', href: '/library/playlists', requires: 'playlists' },
    ],
  },
]

export function LibraryHomeScreen() {
  const { provider } = useServerSession()
  const bottom = useBottomSpace()

  // 按后端能力过滤：换成 Emby 后不支持的项会自动消失，整组都没了就不画这张卡
  const groups = useMemo(() => {
    const capabilities = provider?.capabilities
    const allowed = (entry: LibraryEntry) => {
      if (!entry.requires) return true
      if (!capabilities) return false
      if (entry.requires === 'favorites') return capabilities.favorites
      if (entry.requires === 'playHistory') return capabilities.playHistory
      if (entry.requires === 'genres') return capabilities.genres
      return capabilities.playlists !== 'none'
    }
    return GROUPS.map((group) => ({ ...group, entries: group.entries.filter(allowed) })).filter(
      (group) => group.entries.length > 0,
    )
  }, [provider])

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.card}>
            {group.entries.map((entry, index) => (
              <Link key={entry.href} href={entry.href} asChild>
                <Pressable
                  style={StyleSheet.flatten([styles.row, index > 0 && styles.rowBorder])}
                  accessibilityRole="button"
                  accessibilityLabel={entry.label}
                >
                  <Icon name={entry.icon} size={iconSize.md} color={colors.accent} />
                  <Text style={styles.label}>{entry.label}</Text>
                  <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  group: { gap: spacing.sm },
  groupTitle: { ...typography.footnote, color: colors.textTertiary, marginLeft: spacing.xs },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  // flex 让标题占满中间，右侧箭头自然贴到行尾
  label: { ...typography.callout, color: colors.textPrimary, flex: 1 },
})
