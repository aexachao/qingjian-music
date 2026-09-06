import type { ComponentProps } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { colors } from '@/theme/tokens'

/**
 * 全 App 唯一的图标出口。
 *
 * 用 Material Icons（@expo/vector-icons 自带的那一套**面性/实心**图标）：
 * - 整套都是面性，播放控制、页签、列表行摆在一起风格是统一的，
 *   不会出现一半线性一半面性的割裂感（这是之前用 lucide 线性图标的问题）；
 * - 一个字体文件覆盖 2200+ 字形，iOS / Android 字形完全一致，
 *   字体在构建期嵌入（见 app.json 的 expo-font），不会首帧空白；
 * - 只有「收藏」这类需要区分开/关的状态，才用同族的空心变体（favorite-border）表示未选中。
 *
 * 两条硬规矩：**不许用 emoji 当图标**，**不许再引入第二套图标库**。
 */

/**
 * 尺寸档位：列表 / 页签 / 工具栏用前四档，
 * 后两档只给正在播放页的传输控制（对齐 Apple Music 那种大按钮，不带圆形底）。
 */
export const iconSize = { sm: 16, md: 20, lg: 24, xl: 28, xxl: 40, hero: 56 } as const

type GlyphName = ComponentProps<typeof MaterialIcons>['name']

/** 语义名 → Material 字形名。页面只认左边的语义名，换图标只改这一张表 */
const ICONS = {
  // 播放控制
  play: 'play-arrow',
  pause: 'pause',
  next: 'skip-next',
  previous: 'skip-previous',
  shuffle: 'shuffle',
  repeat: 'repeat',
  repeatOne: 'repeat-one',
  /** 无限播放（队列播完自动续歌） */
  infinity: 'all-inclusive',
  /** 隔空投送 / 输出设备 */
  airplay: 'airplay',
  volumeDown: 'volume-down',
  volumeUp: 'volume-up',
  copy: 'content-copy',
  share: 'share',
  heart: 'favorite',
  queue: 'queue-music',
  lyrics: 'lyrics',
  drag: 'drag-handle',
  playing: 'graphic-eq',
  // 导航
  home: 'home',
  search: 'search',
  library: 'library-music',
  settings: 'settings',
  back: 'arrow-back',
  chevronDown: 'expand-more',
  chevronRight: 'chevron-right',
  close: 'close',
  check: 'check',
  // 资料库分类
  albums: 'album',
  artists: 'mic',
  tracks: 'music-note',
  genres: 'category',
  playlists: 'playlist-play',
  recentlyAdded: 'auto-awesome',
  recentlyPlayed: 'history',
  radio: 'radio',
  downloaded: 'download-for-offline',
  // 设置
  server: 'dns',
  signOut: 'logout',
  password: 'lock',
  appearance: 'palette',
  quality: 'high-quality',
  storage: 'storage',
  user: 'person',
  // 通用动作
  add: 'add',
  more: 'more-horiz',
  trash: 'delete',
  importPlaylist: 'playlist-add',
} satisfies Record<string, GlyphName>

export type IconName = keyof typeof ICONS

/** 需要「未选中」形态的图标，用同族空心变体；没列进来的图标永远是面性 */
const OUTLINE_VARIANTS = {
  heart: 'favorite-border',
} satisfies Partial<Record<IconName, GlyphName>>

/**
 * 领域层 BrowseNode.icon 存的是 SF Symbols 名（为 CarPlay 预留），
 * 这里映射到同一套图标，两处不会各写一份图标表。
 */
const SF_SYMBOL_ALIASES: Record<string, IconName> = {
  'clock.badge.checkmark': 'recentlyAdded',
  'clock.arrow.circlepath': 'recentlyPlayed',
  heart: 'heart',
  'dot.radiowaves.left.and.right': 'radio',
  'square.stack': 'albums',
  'music.mic': 'artists',
  'music.note': 'tracks',
  guitars: 'genres',
  'music.note.list': 'playlists',
  'arrow.down.circle': 'downloaded',
}

export function iconForSymbol(symbol: string): IconName {
  return SF_SYMBOL_ALIASES[symbol] ?? 'tracks'
}

export interface IconProps {
  name: IconName
  size?: number
  color?: string
  /**
   * 是否面性。默认就是面性；只有存在空心变体的图标（目前只有收藏）
   * 传 false 才会变成空心，用来表达「未选中」。
   */
  filled?: boolean
}

export function Icon({ name, size = iconSize.md, color = colors.iconMid, filled = true }: IconProps) {
  const outline = (OUTLINE_VARIANTS as Partial<Record<IconName, GlyphName>>)[name]
  const glyph: GlyphName = !filled && outline ? outline : ICONS[name]
  return <MaterialIcons name={glyph} size={size} color={color} />
}

export interface IconButtonProps extends IconProps {
  onPress: () => void
  /** 无障碍标签必填：纯图标按钮没有可读文本 */
  accessibilityLabel: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

/** 纯图标按钮：命中区固定撑到 44×44（iOS HIG 最小可点面积），视觉大小不受影响 */
export function IconButton({ onPress, accessibilityLabel, disabled = false, style, ...icon }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      style={[styles.button, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      <Icon {...icon} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
})
