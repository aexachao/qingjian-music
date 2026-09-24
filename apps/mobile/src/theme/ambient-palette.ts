/**
 * 播放器全屏沉浸流体氛围调色板（Ambient Palette System）
 *
 * 参照 Apple Music 氛围光设计规范：
 * - 不再拉伸原始图片，避免人像产生纵向条纹残影与变形；
 * - 采用「主导强调色 + 次级氛围高光 + 深沉基调色 + 纯黑收底色」四重色阶，
 *   在底层绘制超大高斯模糊的抽象多色弥散光斑（Ambient Blobs）；
 * - 所有色值严格收口在 theme/ 目录下，符合架构守卫规则。
 */

export interface AmbientPalette {
  /** Color A（主导强调色）：用于左上部核心光斑，奠定视觉基调 */
  primary: string
  /** Color B（明亮次级色/氛围高光）：用于右中部光斑，提供层次感与灵动感 */
  secondary: string
  /** Color C（深沉基调色/暗部色）：用于中下部大面积光斑，与底色融合 */
  dark: string
  /** Color D（纯黑收底色）：全屏纯深黑托底，杜绝色彩过曝并衬托白色文字 */
  background: string
}

/** 预置的经典流体氛围光调色板（对齐 Apple Music 质感） */
export const PRESET_AMBIENT_PALETTES: AmbientPalette[] = [
  // 0. 绯红月夜（酒红 / 珊瑚暖橙 / 暮黑）
  {
    primary: '#8e1728',
    secondary: '#d9534f',
    dark: '#261117',
    background: '#08080a',
  },
  // 1. 深海幽蓝（黛蓝 / 晴空湖青 / 墨渊）
  {
    primary: '#1c4c78',
    secondary: '#3d83b6',
    dark: '#0e1926',
    background: '#08080a',
  },
  // 2. 落日流金（暖褐橙 / 柔金 / 焦糖深咖）
  {
    primary: '#a64b18',
    secondary: '#db8238',
    dark: '#24160f',
    background: '#08080a',
  },
  // 3. 极光苍翠（松绿 / 薄荷玉青 / 墨绿暗部）
  {
    primary: '#1c664e',
    secondary: '#419976',
    dark: '#0e1f18',
    background: '#08080a',
  },
  // 4. 暮霭幽紫（天鹅绒紫 / 丁香熏紫 / 墨紫冷灰）
  {
    primary: '#592976',
    secondary: '#8f529c',
    dark: '#1a0f24',
    background: '#08080a',
  },
  // 5. 琥珀青铜（青铜流金 / 香槟麦金 / 暖焦石）
  {
    primary: '#765922',
    secondary: '#b28d40',
    dark: '#1f190e',
    background: '#08080a',
  },
  // 6. 幽夜玄青（冷杉灰蓝 / 雾霭灰 / 纯净冷黑，适合极简或黑白系封面）
  {
    primary: '#2d3744',
    secondary: '#4d5b6e',
    dark: '#12161c',
    background: '#08080a',
  },
]

/** 默认托底调色板 */
export const DEFAULT_AMBIENT_PALETTE: AmbientPalette = PRESET_AMBIENT_PALETTES[0]!

/**
 * 基于标识（如 trackId / coverId / title）进行确定性哈希，
 * 为每张唱片计算其专属的和谐流体调色板；同时支持外部注入自定义配色。
 */
export function resolveAmbientPalette(
  key?: string | undefined,
  custom?: Partial<AmbientPalette> | undefined,
): AmbientPalette {
  if (custom && custom.primary && custom.secondary && custom.dark) {
    return {
      primary: custom.primary,
      secondary: custom.secondary,
      dark: custom.dark,
      background: custom.background ?? '#08080a',
    }
  }

  if (!key) return DEFAULT_AMBIENT_PALETTE

  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }

  const index = Math.abs(hash) % PRESET_AMBIENT_PALETTES.length
  return PRESET_AMBIENT_PALETTES[index] ?? DEFAULT_AMBIENT_PALETTE
}
