import { StyleSheet } from 'react-native'
import { createThemedStyles } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

export const useStyles = createThemedStyles((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  flex: {
    flex: 1,
  },
  // 满足 visual-consistency.test.ts 的空状态居中契约
  contentGrow: {
    flexGrow: 1,
  },
  heroRoot: {
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgPrimary,
  },
  billboardContainer: {
    width: '100%',
    height: 352,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  billboardImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomDissolve: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 250,
  },
  heroInfoOverlay: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 6,
    zIndex: 2,
  },
  heroArtistName: {
    fontSize: 34,
    fontFamily: fonts.bold,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  heroMetaText: {
    ...typography.subhead,
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  tabsWrapper: {
    marginTop: spacing.md,
  },
  // 专辑网格样式
  gridAlbumName: {
    ...typography.callout,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  gridAlbumYear: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  albumFilterRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  albumFilter: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  albumFilterSelected: { backgroundColor: colors.bgButtonSecondary },
  albumFilterText: { ...typography.caption, color: colors.textSecondary },
  albumFilterTextSelected: { color: colors.textPrimary, fontFamily: fonts.semibold, fontWeight: '600' },
  catalogNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  catalogNoticeText: { ...typography.caption, color: colors.textSecondary },
  catalogRetry: { ...typography.caption, color: colors.actionText, fontFamily: fonts.semibold, fontWeight: '600' },
  // 全部歌曲样式
  toolbarSlot: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  trackRowWrapper: {
    paddingHorizontal: spacing.lg,
  },
  separator: {
    height: 1,
    marginLeft: spacing.lg + 60,
    marginRight: spacing.lg,
    backgroundColor: colors.borderSubtle,
  },
}))
