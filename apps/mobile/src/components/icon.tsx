import type { ComponentProps } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '@/theme/tokens'

/**
 * 全 App 唯一的图标出口。
 * 我们使用 Ionicons 来完美复刻 Apple Music 的 iOS 原生系统图标风格，
 * 同时保证它在跨平台（Android/Web）下的兼容性。
 */

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 28, xxl: 40, hero: 56 } as const

type GlyphName = ComponentProps<typeof Ionicons>['name']

const ICONS = {
  // 播放控制
  play: 'play',
  pause: 'pause',
  next: 'play-forward',
  previous: 'play-back',
  shuffle: 'shuffle',
  repeat: 'repeat',
  repeatOne: 'repeat',
  infinity: 'infinite',
  airplay: 'tv', // Ionicons 不带 airplay，用 tv 或 radio 替代
  volumeDown: 'volume-low',
  volumeUp: 'volume-high',
  copy: 'copy',
  share: 'share',
  heart: 'heart',
  queue: 'list',
  lyrics: 'chatbox',
  drag: 'menu',
  playing: 'cellular',
  // 导航
  home: 'home',
  search: 'search',
  library: 'library',
  settings: 'settings',
  back: 'chevron-back',
  chevronDown: 'chevron-down',
  chevronRight: 'chevron-forward',
  close: 'close',
  check: 'checkmark',
  // 资料库分类
  albums: 'albums',
  artists: 'mic',
  tracks: 'musical-notes',
  genres: 'list', // Ionicons 不带 guitar，用 list 替代
  playlists: 'musical-note',
  recentlyAdded: 'time',
  recentlyPlayed: 'refresh-circle',
  radio: 'radio',
  downloaded: 'arrow-down-circle',
  // 设置
  server: 'server',
  signOut: 'log-out',
  password: 'lock-closed',
  appearance: 'color-palette',
  quality: 'options',
  storage: 'folder',
  user: 'person',
  // 通用动作
  add: 'add',
  more: 'ellipsis-horizontal',
  remove: 'remove',
  trash: 'trash',
  importPlaylist: 'add-circle',
} satisfies Record<string, GlyphName>

export type IconName = keyof typeof ICONS

const OUTLINE_VARIANTS = {
  heart: 'heart-outline',
  play: 'play-outline',
  pause: 'pause-outline',
} satisfies Partial<Record<IconName, GlyphName>>

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
  filled?: boolean
}

export function Icon({ name, size = iconSize.md, color = colors.iconMid, filled = true }: IconProps) {
  if (name === 'repeatOne') {
    // 恢复早期提交 d929d8d 中的 lucide repeat-1 字形（双环箭头带 1），光学尺寸缩放到 0.8 与 Ionicons repeat 视觉完全一致
    const opticalSize = Math.round(size * 0.8)
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg
          width={opticalSize}
          height={opticalSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="m17 2 4 4-4 4" />
          <Path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <Path d="m7 22-4-4 4-4" />
          <Path d="M21 13v1a4 4 0 0 1-4 4H3" />
          <Path d="M11 10h1v4" />
        </Svg>
      </View>
    )
  }
  const outline = (OUTLINE_VARIANTS as Partial<Record<IconName, GlyphName>>)[name]
  const glyph: GlyphName = !filled && outline ? outline : ICONS[name]
  return <Ionicons name={glyph} size={size} color={color} />
}

export interface IconButtonProps extends IconProps {
  onPress: () => void
  /** 无障碍标签必填：纯图标按钮没有可读文本 */
  accessibilityLabel: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  isActive?: boolean
}

/** 纯图标按钮：命中区固定撑到 44×44（iOS HIG 最小可点面积），视觉大小不受影响 */
export function IconButton({ onPress, accessibilityLabel, disabled = false, style, isActive, ...icon }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      style={({ pressed }) => [
        styles.button,
        isActive && styles.buttonActive,
        pressed && styles.buttonPressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: isActive }}
    >
      <Icon {...icon} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  buttonActive: { backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  buttonPressed: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
})
