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
  bgModal: '#1e1c26',
  bgDropdown: '#0a0a0eb8',
  bgFloatingPill: '#ffffff12',
  bgProgressTrack: '#ffffff26',
  bgOverlay: '#000000b3',
  bgScrim: '#0000004d',
  bgScrimStrong: '#00000073',
  bgAvatar: '#ffffff1a',
  queueBg: '#00000014',
  // --- CTA 主操作胶囊（Apple Music 风格高对比胶囊：深色下纯白底黑字，浅色下纯黑底白字） ---
  ctaPrimaryBg: '#ffffff',
  ctaPrimaryText: '#000000',
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
  /** 加载指示器：暗色主题使用纯白，浅色主题使用纯黑，保持与中性背景的对比。 */
  loadingIndicator: '#ffffff',
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
  playerToolbarSelected: '#ffffff5c',
  playerToolbarControl: '#ffffff1f',
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
  /**
   * 破坏性动作。**刻意与品牌红拆开**（2026-09-15 第 3 轮）：
   * 以前 danger 与 accent 是同一个值，改品牌色会把「删除/清空」这些危险动作一起改掉。
   * 现在它是独立的 knob，用 iOS 的系统红。
   */
  danger: '#ff3b30',
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
  /** 收藏（喜欢）的粉色。同样与品牌红拆开，独立可改 */
  like: '#f05672',
  /**
   * 二维码底色：永远白底（深色主题也一样）—— 反色就扫不出来了。
   * 所以它是独立的 token，不跟 `bgPrimary` 走。
   */
  qrSurface: '#ffffff',
  /** 阴影永远是黑，但也要有 token（组件里禁止出现十六进制字面量） */
  shadow: '#000000',
  /**
   * 封面占位：**一个浅灰底 + 一个比底深一点的灰记号**（不用品牌色，免得整屏红）。
   * 浅色下记号确实比底深；深色下如果还「更深」就看不见了，所以那一套反过来给「更浅」的灰 ——
   * 关系是「比底色更有存在感」，不是死守方向。两个值都在 `theme-roles.test.ts` 里锁着。
   */
  coverPlaceholder: '#ffffff14',
  coverPlaceholderMark: '#ffffff33',
  storageChartDownloads: '#69a8ff',
  storageChartAudio: '#55cbb0',
  storageChartLyrics: '#c19aff',
  storageChartArtwork: '#ffc15a',
  storageChartOther: '#8d8d93',
  // 漫游唱片机的器物材质，不承担操作或状态语义。
  roamingDeck: '#29292d',
  roamingDeckFront: '#1b1b1f',
  roamingMetal: '#bfc0c5',
  roamingRecordLabel: '#b7858c',
  roamingLabelPaper: '#e1b6b0',
  roamingLamp: '#ff8396',
  roamingLampCore: '#ffe3e8',
  // 深色氛围用低明度的有色光，避免浅色光源叠成灰白雾层。
  roamingAmbient: '#a9365c',
  roamingAmbientApricot: '#945027',
  roamingAmbientLavender: '#654399',
  roamingTitleAccent: '#e0b2bf',
  roamingEdge: '#e0b2bf',
  homeFavoritesEdge: '#c78695',
  homeDownloadsEdge: '#819ebb',
  roamingSupportingText: '#ffffffad',
  homeFavoritesGlow: '#c78695',
  homeDownloadsGlow: '#819ebb',
} as const

export type PaletteKey = keyof typeof darkPalette
/** 一套配色：键固定，值都是颜色字符串 */
export type Palette = Record<PaletteKey, string>

/** 亮色模式（浅灰底 #f2f2f7 + 纯白卡片 #ffffff，对齐 iOS HIG 分组风格） */
const lightPalette: Palette = {
  bgPrimary: '#f2f2f7',
  bgCard: '#ffffff',
  bgCardHover: '#f0f0f5',
  bgListItem: '#ffffff',
  bgListItemSoft: '#f8f8fa',
  bgListItemHover: '#f0f0f5',
  bgListItemActive: '#e5e5ea',
  bgInput: '#0000000a',
  bgButtonPrimary: '#0000000f',
  bgButtonSecondary: '#0000000d',
  bgModal: '#ffffff',
  bgDropdown: '#fffffff2',
  bgFloatingPill: '#ffffffd9',
  bgProgressTrack: '#0000001f',
  bgOverlay: '#00000066',
  bgScrim: '#0000002e',
  bgScrimStrong: '#0000004d',
  bgAvatar: '#00000014',
  queueBg: '#0000000a',
  // --- CTA 主操作胶囊（Apple Music 风格高对比胶囊：深色下纯白底黑字，浅色下纯黑底白字） ---
  ctaPrimaryBg: '#111111',
  ctaPrimaryText: '#ffffff',
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
  /** 加载指示器：暗色主题使用纯白，浅色主题使用纯黑，保持与中性背景的对比。 */
  loadingIndicator: '#000000',
  borderDefault: '#00000014',
  borderSubtle: '#0000000f',
  borderEmphasis: '#0000001f',
  borderSelected: '#0000008c',
  borderInput: '#00000033',
  playerProgressTrack: '#00000033',
  playerProgressBuffer: '#00000014',
  playerProgressFill: '#111111b3',
  playerProgressFillActive: '#111111',
  playerTextSecondary: '#00000059',
  playerToolbarSelected: '#ffffff5c',
  playerToolbarControl: '#0000000f',
  playerGlassBg: '#ffffffcc',
  playerGlassBorder: '#0000001f',
  bgFloatingBlur: '#ffffffd9',
  bgFloatingSolid: '#ffffff',
  danger: '#ff3b30',
  success: '#6bab45',
  warning: '#f8bf28',
  info: '#1b73fb',
  skeleton1: '#0000000a',
  skeleton2: '#00000014',
  skeleton3: '#00000029',
  surfaceGrouped: '#f2f2f7',
  surfaceCard: '#ffffff',
  surfaceCardHover: '#f0f0f5',
  hairlineBorder: '#00000014',
  badgeBg: '#0000000d',
  badgeBorder: '#0000001a',
  badgeText: '#0000008c',
  like: '#f05672',
  qrSurface: '#ffffff',
  shadow: '#000000',
  /** 封面占位：浅灰底 + 更深的灰记号（见深色那套的注释） */
  coverPlaceholder: '#0000000f',
  coverPlaceholderMark: '#00000026',
  storageChartDownloads: '#2563c7',
  storageChartAudio: '#087c68',
  storageChartLyrics: '#7040b5',
  storageChartArtwork: '#a86100',
  storageChartOther: '#77777f',
  roamingDeck: '#29292d',
  roamingDeckFront: '#1b1b1f',
  roamingMetal: '#bfc0c5',
  roamingRecordLabel: '#b7858c',
  roamingLabelPaper: '#e1b6b0',
  roamingLamp: '#ff8396',
  roamingLampCore: '#ffe3e8',
  roamingAmbient: '#da6f83',
  roamingAmbientApricot: '#d5ad8c',
  roamingAmbientLavender: '#a196cc',
  roamingTitleAccent: '#99516b',
  // 白色表面用更沉稳的局部色边，与极浅背景柔光分开。
  roamingEdge: '#9b4d66',
  homeFavoritesEdge: '#a45d72',
  homeDownloadsEdge: '#527b9e',
  roamingSupportingText: '#111111ad',
  homeFavoritesGlow: '#c78695',
  homeDownloadsGlow: '#819ebb',
}

export const palette: { dark: Palette; light: Palette } = { dark: darkPalette, light: lightPalette }

export type ResolvedTheme = keyof typeof palette
/**
 * L2 语义角色（2026-09-15 第 3 轮加的）。
 *
 * ── 为什么要有这一层 ────────────────────────────────────────────────────────
 * 以前 `accent` 一个 token 同时表示「选中 / 正在播放 / 收藏 / 可点动作 / 导航高亮」，
 * 一屏里出现三四处红就会吵；而且 `accent`、`danger`、`like`、`playing` 四个 token
 * **是同一个值** —— 「以后想改颜色」这件事在结构上其实做不到。
 *
 * 现在分三层：
 *   L1 调色板（`palette` / `accents`）：具体色值，**只有本文件用**；
 *   L2 角色（本类型）：`primaryAction` / `stateSelected` / `playing` / `like` / `danger` /
 *       `actionText` / `actionTextMuted` / `disabledText` / `loadingIndicator` / `shadow` —— 组件只许用这些；
 *   L3 组件：`colors.<角色>`。
 *
 * 想「少用红」「换品牌色」「收藏改黄」，只改 L2 的映射（几行），全 App 一起生效。
 * `accent` 保留给**品牌标识**（应用图标预览、关于页 logo 这类非功能位），
 * 组件里直接用 `colors.accent` 会被架构守卫拦下（存量已记基线，只减不增）。
 */
export type ThemeColors = Palette & {
  /** 品牌色。**只用于品牌标识**；功能处一律用下面的角色 */
  accent: string
  /** 每屏最多一处的主行动（确认按钮、页面主 CTA） */
  primaryAction: string
  /** 选中 / 激活：勾选框、页签、开关、开关型图标、导航高亮、光标 */
  stateSelected: string
  /** 正在播放的高亮色 */
  playing: string
  /** 收藏（喜欢）色 */
  like: string
  /** 普通可点动作的图标与文字（中性，不再是品牌红） */
  actionText: string
  /** 次要动作（比 actionText 弱一级） */
  actionTextMuted: string
  /** 不可点状态 */
  disabledText: string
  /** 加载指示器：随主题使用纯白或纯黑，独立于品牌色与按钮文字角色 */
  loadingIndicator: string
  /**
   * 品牌色的**装饰性**用法：设置入口的小图标、Hub 卡、封面占位……
   * 单独立一个角色，是为了让「品牌色太抢眼」这件事有一个旋钮可拧
   * （改这里一处就能把这些装饰位统一下调），而不必动状态色与主行动色。
   */
  brandTint: string
}

function createThemeColors(base: Palette): ThemeColors {
  const accent = accents[DEFAULT_ACCENT]
  return {
    ...base,
    accent,
    primaryAction: accent,
    stateSelected: accent,
    playing: accent,
    like: base.like,
    actionText: base.textPrimary,
    actionTextMuted: base.textSecondary,
    disabledText: base.textQuaternary,
    loadingIndicator: base.loadingIndicator,
    brandTint: accent,
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
 * 字体：系统原生字体（iOS: San Francisco + 苹方，Android: Roboto + 思源黑体）。
 * 在 React Native 中，'System' 会触发 iOS 原生 UIFont systemFont 渲染体系，
 * Android 会自动回落到系统默认无衬线字体。结合显式 fontWeight 实现精准排版。
 */
export const fonts = {
  regular: 'System',
  medium: 'System',
  semibold: 'System',
  bold: 'System',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  pageMargin: 16,
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
  largeTitle: { fontSize: 34, fontFamily: fonts.bold, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontFamily: fonts.bold, fontWeight: '700' as const, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 18, fontFamily: fonts.bold, fontWeight: '700' as const, letterSpacing: -0.3 },
  title3: { fontSize: 20, fontFamily: fonts.semibold, fontWeight: '600' as const, letterSpacing: -0.2 },
  headline: { fontSize: 17, fontFamily: fonts.semibold, fontWeight: '600' as const, letterSpacing: -0.4 },
  body: { fontSize: 17, fontFamily: fonts.regular, fontWeight: '400' as const, letterSpacing: -0.4 },
  callout: { fontSize: 16, fontFamily: fonts.regular, fontWeight: '400' as const },
  subhead: { fontSize: 15, fontFamily: fonts.regular, fontWeight: '400' as const, letterSpacing: -0.2 },
  footnote: { fontSize: 13, fontFamily: fonts.medium, fontWeight: '500' as const, letterSpacing: 0 },
  caption: { fontSize: 12, fontFamily: fonts.regular, fontWeight: '400' as const, letterSpacing: 0.2 },
  badge: { fontSize: 10, fontFamily: fonts.bold, fontWeight: '700' as const, letterSpacing: 0.5 },
} as const
