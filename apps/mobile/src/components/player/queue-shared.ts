import { fonts, radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles } from '@/theme/theme-provider'

export const LONG_PRESS_MS = 350
export const TAP_SLOP = 12
export const RADIO_FETCH_MORE = 10
export const SWIPE_DELETE_HIT_WIDTH_UPCOMING_PORTRAIT = 104
export const SWIPE_DELETE_HIT_WIDTH_UPCOMING_LANDSCAPE = 88
export const SWIPE_DELETE_HIT_WIDTH_HISTORY_PORTRAIT = 64
export const SWIPE_DELETE_HIT_WIDTH_HISTORY_LANDSCAPE = 40

export type QueueTab = 'upcoming' | 'history'

export const useQueueStyles = createThemedStyles((colors) => ({
  container: { flex: 1, overflow: 'hidden' },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  pagerViewport: {
    flex: 1,
  },
  pagerViewportContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  pagerTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    flex: 1,
    height: '100%',
  },
  list: { paddingBottom: spacing.xxl + spacing.md },
  empty: { ...typography.callout, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },

  modesHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  modesHeaderLandscape: {
    paddingHorizontal: 0,
  },
  modes: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: spacing.lg,
  },
  mode: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
  },
  modeActive: { backgroundColor: colors.textPrimary },

  queueTabsContainer: {
    position: 'relative',
    minHeight: 34,
    justifyContent: 'flex-start',
  },
  queueTabs: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  queueTab: { minHeight: 30, justifyContent: 'flex-start' },
  queueTabText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    fontWeight: '400',
    color: colors.textSecondary,
    letterSpacing: -0.2,
  },
  queueTabTextActive: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  queueTabIndicator: {
    position: 'absolute',
    top: 26,
    left: 0,
    width: 16,
    height: 2.5,
    borderRadius: radius.pill,
    backgroundColor: colors.textPrimary,
  },
  queueTabSpacer: { flex: 1 },
  listClear: { ...typography.callout, color: colors.iconMid },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyStateContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  emptyStateTitle: {
    ...typography.subhead,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyStateButton: {
    marginTop: spacing.sm,
    height: 32,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.bgButtonSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateButtonPressed: {
    backgroundColor: colors.bgCardHover,
  },
  emptyStateButtonText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  currentCard: {
    height: 88,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
    overflow: 'hidden',
  },
  currentInfo: { flex: 1, justifyContent: 'center' },
  currentTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currentTitle: { ...typography.title, color: colors.textPrimary, flexShrink: 1 },
  currentArtist: { ...typography.callout, color: colors.textSecondary, marginTop: 2 },
  currentActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  // 待播行：主触控区与右侧控件区是兄弟节点，物理隔离事件
  rowWrapper: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  rowWrapperLandscape: {
    paddingHorizontal: 0,
  },
  rowMain: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: { flex: 1, gap: 2, justifyContent: 'center' },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowTitle: { ...typography.callout, color: colors.textPrimary, flexShrink: 1 },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  deleteAction: { backgroundColor: colors.danger || 'red', justifyContent: 'center', alignItems: 'center', width: 80, height: '100%' },
  deleteIconBg: { backgroundColor: colors.textOnAccent, borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  dragSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playingIconBg: { backgroundColor: colors.textPrimary, borderRadius: radius.pill, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
}))
