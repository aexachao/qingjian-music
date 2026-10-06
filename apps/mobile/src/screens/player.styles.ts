import { StyleSheet } from 'react-native'
import { getThemeColors, radius, spacing, typography } from '@/theme/tokens'

export const darkColors = getThemeColors('dark')

export const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  root: { backgroundColor: darkColors.bgPrimary },
  emptyRoot: { flex: 1, width: '100%' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { ...typography.subhead, color: darkColors.textSecondary },
  header: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xs,
    // 拖动小横条往上移（-12 再 -10 = -22）
    marginTop: -22,
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: darkColors.iconDim,
  },
  stageViewport: {
    flex: 1,
    position: 'relative',
  },
  pinnedHeaderOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  pinnedHeader: { zIndex: 10 },
  portraitLyricsControls: { position: 'absolute', left: 0, right: 0, paddingHorizontal: spacing.xl },
  lyricSettingsRow: { position: 'absolute', right: spacing.xl, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  hiddenControlsTapZone: { position: 'absolute', left: 0, right: 0, height: 44, zIndex: 8, alignItems: 'center', justifyContent: 'center' },
  immersionHint: { ...typography.caption, color: darkColors.textTertiary },
  lyricsToolbarOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10 },
  lyricsStage: { flex: 1, position: 'relative' },
  // paddingBottom 再减 10（lg 16 → 6）：播放器整块再下移 10pt，更贴底部工具栏
  page: { flex: 1, paddingTop: spacing.xs, paddingBottom: 6, gap: spacing.lg },
  stage: { flex: 1 },
  stageFill: { flex: 1, paddingHorizontal: spacing.xl },
  lyricActions: { position: 'absolute', right: spacing.xl, bottom: 24, zIndex: 20 },
  coverGestureContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  coverStage: {
    flex: 1,
    justifyContent: 'space-between',
  },
  coverImageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverScaleLayer: { width: '100%', alignItems: 'center' },
  titleRowWrapper: {
    paddingHorizontal: spacing.xl,
  },
  menuScrim: { backgroundColor: 'rgba(0, 0, 0, 0.001)', zIndex: 9999 },
})
