import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '@/theme/tokens'

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
      <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
        <Text style={styles.retryLabel}>重试</Text>
      </Pressable>
    </View>
  )
}

export function FooterLoader({ loading }: { loading: boolean }) {
  if (!loading) return null
  return <ActivityIndicator style={styles.footer} color={colors.accent} />
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  muted: { ...typography.subhead, color: colors.textSecondary, textAlign: 'center' },
  retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryLabel: { ...typography.headline, color: colors.accent },
  footer: { paddingVertical: spacing.lg },
})
