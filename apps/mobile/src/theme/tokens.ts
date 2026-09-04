/**
 * 视觉基线：暗色优先，取向 Apple Music。
 * 强调色后续做成可切换（web 端有 5 个），所以这里集中成常量而不是散落各处。
 */
export const colors = {
  background: '#000000',
  surface: '#1C1C1E',
  surfaceElevated: '#2C2C2E',
  separator: 'rgba(84, 84, 88, 0.6)',
  text: '#FFFFFF',
  textSecondary: 'rgba(235, 235, 245, 0.6)',
  textTertiary: 'rgba(235, 235, 245, 0.3)',
  accent: '#FF2D55',
  danger: '#FF453A',
  success: '#30D158',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const

export const typography = {
  largeTitle: { fontSize: 34, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' },
  callout: { fontSize: 16, fontWeight: '400' },
  subhead: { fontSize: 15, fontWeight: '400' },
  footnote: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const
