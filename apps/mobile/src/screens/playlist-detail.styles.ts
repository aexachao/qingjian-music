import { StyleSheet } from 'react-native'
import { createThemedStyles } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

export const useStyles = createThemedStyles((colors) => ({
  root: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerRoot: {
    marginBottom: 0,
  },
  coverBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  coverContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverShadowWrapper: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: spacing.xs,
    borderRadius: radius.album,
  },
  title: {
    ...typography.title,
    fontSize: 24,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: spacing.lg,
    lineHeight: 30,
  },
  description: {
    ...typography.footnote,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginTop: 18,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.detailActionSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
  },
  actionButtonActive: {
    borderColor: colors.borderEmphasis,
  },
  actionButtonLabel: {
    ...typography.subhead,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.medium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  toolbarSlot: {
    alignSelf: 'stretch',
    marginTop: 20,
    marginBottom: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  separator: {
    height: 1,
    marginLeft: 60,
    backgroundColor: colors.borderSubtle,
  },
  navBottomBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  navTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 220,
  },
  navTitleText: {
    ...typography.headline,
    fontSize: 15,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  navRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
}))
