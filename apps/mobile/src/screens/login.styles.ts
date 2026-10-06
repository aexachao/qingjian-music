import { createThemedStyles } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export const useStyles = createThemedStyles((colors) => ({
  flex: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl + 8,
  },
  logoWrapper: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
  },
  formSection: {
    gap: spacing.md,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md + 2,
    minHeight: 54,
  },
  inputCardFocused: {
    borderColor: colors.borderSelected,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: spacing.md,
  },
  fieldAction: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auxiliaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.xs,
  },
  rememberText: {
    ...typography.footnote,
    color: colors.textSecondary,
    fontSize: 14,
  },
  httpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  httpsLabel: {
    ...typography.subhead,
    color: colors.textPrimary,
    fontSize: 15,
  },
  errorBlock: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  errorText: {
    ...typography.footnote,
    color: colors.danger,
    flex: 1,
  },
  resetHintText: {
    ...typography.caption,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.primaryAction,
    borderRadius: radius.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.bgButtonPrimary,
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    ...typography.headline,
    color: colors.textOnAccent,
    fontSize: 17,
  },
  buttonLabelDisabled: {
    color: colors.textTertiary,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
}))
