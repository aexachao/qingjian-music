import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/tokens'

export function LoadingState() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
    </View>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{text}</Text>
    </View>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{error instanceof Error ? error.message : '加载失败'}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="重新加载" style={styles.retry}>
        <Text style={styles.retryLabel}>重试</Text>
      </Pressable>
    </View>
  )
}

export function PaginationFooter({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error?: unknown
  onRetry?: () => void
}) {
  if (loading) return <ActivityIndicator style={styles.footer} color={colors.accent} />
  if (!error || !onRetry) return null
  return (
    <Pressable onPress={onRetry} accessibilityRole="button" style={styles.footerRetry}>
      <Text style={styles.muted}>加载更多失败，点按重试</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  muted: { ...typography.subhead, color: colors.textSecondary, textAlign: 'center' },
  // 次级按钮：胶囊 + 半透明底，和 web 端 --ds-bg-button-secondary 一致
  retry: {
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
  },
  retryLabel: { ...typography.headline, color: colors.textPrimary },
  footer: { paddingVertical: spacing.lg },
  footerRetry: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
})
