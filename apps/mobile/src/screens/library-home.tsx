import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Link } from 'expo-router'
import { DEFAULT_BROWSE_NODES, type BrowseNode, type BrowseNodeKind } from '@qj/core-domain'
import { Icon, iconForSymbol, iconSize } from '@/components/icon'
import { useBottomSpace } from '@/lib/bottom-space'
import { useServerSession } from '@/lib/server-session'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/** i18n 前的中文文案表：以后换成 locales/zh-CN.json 的同名 key */
const LABELS: Record<string, string> = {
  'browse.recentlyAdded': '最近添加',
  'browse.recentlyPlayed': '最近播放',
  'browse.favorites': '我喜欢的音乐',
  'browse.radio': '漫游电台',
  'browse.albums': '专辑',
  'browse.artists': '艺术家',
  'browse.tracks': '歌曲',
  'browse.genres': '流派',
  'browse.playlists': '歌单',
}

/** 每个入口对应的路由；漫游电台还没做，先不显示 */
const ROUTES = {
  recentlyAdded: '/library/albums',
  recentlyPlayed: '/library/history',
  favorites: '/library/favorites',
  albums: '/library/albums',
  artists: '/library/artists',
  tracks: '/library/tracks',
  genres: '/library/genres',
  playlists: '/library/playlists',
} as const satisfies Partial<Record<BrowseNodeKind, string>>

type SupportedKind = keyof typeof ROUTES

function isSupported(node: BrowseNode): node is BrowseNode & { kind: SupportedKind } {
  return node.kind in ROUTES
}

export function LibraryHomeScreen() {
  const { provider, connection } = useServerSession()
  const bottom = useBottomSpace()

  // 按后端能力过滤入口：换成 Emby 后不支持的项会自动消失
  const nodes = useMemo(() => {
    const capabilities = provider?.capabilities
    return DEFAULT_BROWSE_NODES.filter(isSupported).filter((node) => {
      if (!node.requires) return true
      if (!capabilities) return false
      if (node.requires === 'favorites') return capabilities.favorites
      if (node.requires === 'playHistory') return capabilities.playHistory
      if (node.requires === 'genres') return capabilities.genres
      if (node.requires === 'playlists') return capabilities.playlists !== 'none'
      if (node.requires === 'radio') return capabilities.radio
      return true
    })
  }, [provider])

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
      <Text style={styles.server}>{connection?.displayName ?? '未连接服务器'}</Text>
      <View style={styles.card}>
        {nodes.map((node, index) => (
          <Link key={node.kind} href={ROUTES[node.kind]} asChild>
            <Pressable
              style={StyleSheet.flatten([styles.row, index > 0 && styles.rowBorder])}
              accessibilityRole="button"
              accessibilityLabel={LABELS[node.titleKey] ?? node.titleKey}
            >
              {/* 图标名存在领域层里是 SF Symbols 名，这里映射成同语义的 lucide 图标 */}
              <Icon name={iconForSymbol(node.icon)} size={iconSize.lg} color={colors.iconMid} />
              <Text style={styles.label}>{LABELS[node.titleKey] ?? node.titleKey}</Text>
              <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  server: { ...typography.caption, color: colors.textTertiary },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  // flex 让标题占满中间，右侧箭头自然贴到行尾
  label: { ...typography.callout, color: colors.textPrimary, flex: 1 },
})
