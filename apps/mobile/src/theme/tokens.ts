/**
 * 设计 token：**逐个对照飞牛音乐 web 端的 `--ds-*` 变量移植**，不是自己配的色。
 *
 * 来源：`http://<NAS>/music/` 的样式表里 `body,:root,:root[data-theme=dark]` 与
 * `:root[data-theme=light]` 两组共 124/133 个 `--ds-*` 变量（web 端用 Semi Design + Tailwind，
 * 品牌层就是这套 `--ds-*`）。提取脚本与完整对照表见 docs/design-tokens.md。
 *
 * 约定：
 * - 变量名沿用 web 端语义（bgCard / textSecondary / borderDefault …），改动时能直接回查 CSS；
 * - 颜色保留 web 端的 8 位十六进制写法（#ffffff14 = 白 8%），RN 原生支持；
 * - 亮色模式的值一并移植好，等做主题切换时直接用，不用再抠一遍。
 */

/** 7 个可选强调色，与 web 端 `[data-theme-accent=*]` 一致 */
export const accents = {
  purple: '#c934e1',
  red: '#f62c55',
  pink: '#f05672',
  orange: '#fc5e25',
  yellow: '#f8bf28',
  green: '#6bab45',
  blue: '#1b73fb',
} as const

export type AccentName = keyof typeof accents

/**
 * 强调色固定为飞牛音乐后台的主题红 `--ds-accent-red`。
 * （web 端 `:root,body` 里的出厂默认值是 purple，用户实例切到了 red，App 直接跟随主题色。）
 * 注意：这个红和 `--ds-special-danger` 是同一个值，web 端本身也是这样，破坏性操作靠文案区分。
 */
export const DEFAULT_ACCENT: AccentName = 'red'

const darkPalette = {
  // --- 背景 ---
  bgPrimary: '#0f0f0f',
  bgCard: '#ffffff14',
  bgCardHover: '#ffffff1f',
  bgListItem: '#ffffff0f',
  bgListItemSoft: '#ffffff0d',
  bgListItemHover: '#ffffff14',
  bgListItemActive: '#ffffff1a',
  bgInput: '#00000014',
  bgButtonPrimary: '#ffffff14',
  bgButtonSecondary: '#ffffff1a',
  bgModal: '#1e1c26eb',
  bgDropdown: '#0a0a0eb8',
  bgFloatingPill: '#ffffff12',
  bgProgressTrack: '#ffffff26',
  bgOverlay: '#000000b3',
  bgScrim: '#0000004d',
  bgScrimStrong: '#00000073',
  bgAvatar: '#ffffff1a',
  queueBg: '#00000014',
  // --- 文字与图标 ---
  textPrimary: '#ffffff',
  textSecondary: '#ffffffcc',
  textTertiary: '#ffffff99',
  textQuaternary: '#ffffff66',
  textMuted: '#f2f3f4d9',
  textMutedDim: '#f2f3f499',
  iconBright: '#ffffff',
  iconMid: '#f2f3f4cc',
  iconDim: '#f2f3f480',
  iconGray: '#bbbbbb',
  textOnAccent: '#ffffff',
  // --- 描边 ---
  borderDefault: '#ffffff1a',
  borderSubtle: '#ffffff12',
  borderEmphasis: '#ffffff1f',
  borderSelected: '#ffffff8c',
  borderInput: '#ffffff33',
  // --- 播放器 ---
  playerProgressTrack: '#ffffff33',
  playerProgressBuffer: '#ffffff14',
  /**
   * 时间轴/音量条「已播部分」的常态色：比纯白淡、比轨道深；
   * 手指按住时变 playerProgressFillActive（纯白），对齐 Apple Music 的按压反馈。
   * （web 端没有对应变量，这是照 Apple Music 行为补的两个值。）
   */
  playerProgressFill: '#ffffffb3',
  playerProgressFillActive: '#ffffff',
  playerTextSecondary: '#ffffff59',
  playerGlassBg: '#00000099',
  playerGlassBorder: '#ffffff1f',
  /**
   * 悬浮条（迷你播放器）的两个底色。web 端是 backdrop-filter 毛玻璃，
   * RN 没有对应能力，所以：iOS 用 BlurView 打底再叠 Blur 这一层，
   * Android 直接用 Solid 那一层。两个值都是把 web 的半透明色压到
   * 页面底色 bgPrimary 上算出来的，目的是**不透背景**：
   * 之前直接用 bgButtonSecondary（白 10%），列表内容会从条底下透出来。
   */
  bgFloatingBlur: '#18181bd9',
  bgFloatingSolid: '#1f1f23',
  // --- 语义色 ---
  danger: '#f62c55',
  success: '#6bab45',
  warning: '#f8bf28',
  info: '#1b73fb',
  // --- 骨架屏 ---
  skeleton1: '#ffffff0a',
  skeleton2: '#ffffff1a',
  skeleton3: '#ffffff29',
  // --- Apple Music 设计规范表面与材质 ---
  surfaceGrouped: '#121214',
  surfaceCard: '#ffffff0d',
  surfaceCardHover: '#ffffff1a',
  hairlineBorder: '#ffffff14',
  badgeBg: '#ffffff14',
  badgeBorder: '#ffffff1f',
  badgeText: '#ffffffa6',
} as const

export type PaletteKey = keyof typeof darkPalette
/** 一套配色：键固定，值都是颜色字符串 */
export type Palette = Record<PaletteKey, string>

/** 亮色模式（web 端 `[data-theme=light]` 的同名变量） */
const lightPalette: Palette = {
  bgPrimary: '#ffffff',
  bgCard: '#0000000a',
  bgCardHover: '#00000014',
  bgListItem: '#00000008',
  bgListItemSoft: '#00000006',
  bgListItemHover: '#0000000d',
  bgListItemActive: '#00000014',
  bgInput: '#0000000a',
  bgButtonPrimary: '#0000000f',
  bgButtonSecondary: '#00000014',
  bgModal: '#fffffff2',
  bgDropdown: '#ffffffeb',
  bgFloatingPill: '#ffffffb8',
  bgProgressTrack: '#0000001f',
  bgOverlay: '#00000066',
  bgScrim: '#0000002e',
  bgScrimStrong: '#0000004d',
  bgAvatar: '#00000014',
  queueBg: '#0000000a',
  textPrimary: '#111111',
  textSecondary: '#111111cc',
  textTertiary: '#11111199',
  textQuaternary: '#11111166',
  textMuted: '#1c1d1fd9',
  textMutedDim: '#1c1d1f99',
  iconBright: '#111111',
  iconMid: '#1c1d1fcc',
  iconDim: '#1c1d1f80',
  iconGray: '#666666',
  textOnAccent: '#ffffff',
  borderDefault: '#00000012',
  borderSubtle: '#0000000d',
  borderEmphasis: '#0000001f',
  borderSelected: '#0000008c',
  borderInput: '#00000033',
  playerProgressTrack: '#00000033',
  playerProgressBuffer: '#00000014',
  playerProgressFill: '#111111b3',
  playerProgressFillActive: '#111111',
  playerTextSecondary: '#00000059',
  playerGlassBg: '#ffffffcc',
  playerGlassBorder: '#0000001f',
  bgFloatingBlur: '#ffffffd9',
  bgFloatingSolid: '#f4f4f6',
  danger: '#f62c55',
  success: '#6bab45',
  warning: '#f8bf28',
  info: '#1b73fb',
  skeleton1: '#0000000a',
  skeleton2: '#00000014',
  skeleton3: '#00000029',
  surfaceGrouped: '#f2f2f7',
  surfaceCard: '#0000000a',
  surfaceCardHover: '#00000014',
  hairlineBorder: '#00000012',
  badgeBg: '#0000000d',
  badgeBorder: '#0000001a',
  badgeText: '#0000008c',
}

export const palette: { dark: Palette; light: Palette } = { dark: darkPalette, light: lightPalette }

export type ResolvedTheme = keyof typeof palette
export type ThemeColors = Palette & {
  accent: string
  /** 正在播放的高亮色 */
  playing: string
  /** 收藏（喜欢）色 */
  like: string
}

function createThemeColors(base: Palette): ThemeColors {
  const accent = accents[DEFAULT_ACCENT]
  return {
    ...base,
    accent,
    playing: accent,
    like: accent,
  }
}

/** 运行时可选的深浅色 token；对象引用稳定，供 Context 与 Reanimated closure 使用。 */
export const themeColors: Record<ResolvedTheme, ThemeColors> = {
  dark: createThemeColors(darkPalette),
  light: createThemeColors(lightPalette),
}

export function getThemeColors(theme: ResolvedTheme): ThemeColors {
  return themeColors[theme]
}

/**
 * 字体：web 端 `--ds-font-family-base` 首选 Montserrat（NAS 自带同样 4 个字重）。
 * 中文字形 Montserrat 没有，iOS/Android 会自动回落到系统中文字体——
 * 和 web 端表现一致：拉丁字母与数字用 Montserrat，中文用系统字体。
 *
 * 字体由 `expo-font` 配置插件在构建期嵌入（见 app.json），族名就是 TTF 里的 PostScript 名，
 * 所以不需要运行时 loadAsync，也不用为字体卡启动图。
 */
export const fonts = {
  regular: 'Montserrat-Regular',
  medium: 'Montserrat-Medium',
  semibold: 'Montserrat-SemiBold',
  bold: 'Montserrat-Bold',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  pageMargin: 20,
  sectionGap: 24,
  titleGap: 10,
  shelfGap: 16,
} as const

/** 圆角对齐 Apple Music / iOS HIG 规范 */
export const radius = {
  xs: 4,
  sm: 6,
  album: 8,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const

export const typography = {
  largeTitle: { fontSize: 34, fontFamily: fonts.bold, letterSpacing: -0.5 },
  title: { fontSize: 22, fontFamily: fonts.bold, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 18, fontFamily: fonts.bold, letterSpacing: -0.3 },
  title3: { fontSize: 20, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  headline: { fontSize: 17, fontFamily: fonts.semibold, letterSpacing: -0.4 },
  body: { fontSize: 17, fontFamily: fonts.regular, letterSpacing: -0.4 },
  callout: { fontSize: 16, fontFamily: fonts.regular },
  subhead: { fontSize: 15, fontFamily: fonts.regular, letterSpacing: -0.2 },
  footnote: { fontSize: 13, fontFamily: fonts.medium, letterSpacing: 0 },
  caption: { fontSize: 12, fontFamily: fonts.regular, letterSpacing: 0.2 },
  badge: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.5 },
} as const
