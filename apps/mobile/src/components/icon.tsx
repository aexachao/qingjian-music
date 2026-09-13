import type { ComponentProps } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

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
  heartOutline: 'heart-outline',
  queue: 'list',
  lyrics: 'chatbox',
  drag: 'menu',
  playing: 'cellular',
  // 导航
  home: 'home',
  search: 'search',
  library: 'albums',
  musicLibrary: 'albums',
  settings: 'settings',
  back: 'chevron-back',
  chevronDown: 'chevron-down',
  chevronRight: 'chevron-forward',
  close: 'close',
  check: 'checkmark',
  // 音乐库分类
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
  server: 'server-outline',
  signOut: 'log-out-outline',
  password: 'lock-closed-outline',
  appearance: 'color-palette-outline',
  quality: 'play-circle-outline',
  cache: 'film-outline',
  storage: 'folder-outline',
  libraryManage: 'folder-outline',
  user: 'person-outline',
  userManage: 'person-outline',
  feedback: 'mail-outline',
  about: 'information-circle-outline',
  star: 'star-outline',
  document: 'document-text-outline',
  shield: 'shield-checkmark-outline',
  wifi: 'wifi',
  cellular: 'cellular',
  download: 'download-outline',
  // 通用动作
  add: 'add',
  more: 'ellipsis-horizontal',
  remove: 'remove',
  trash: 'trash',
  importPlaylist: 'add-circle',
  info: 'information-circle-outline',
  eye: 'eye-outline',
  eyeOff: 'eye-off-outline',
  history: 'time-outline',
  circle: 'ellipse-outline',
  checkmarkCircle: 'checkmark-circle',
  clear: 'close-circle',
} satisfies Record<string, GlyphName>

export type IconName = keyof typeof ICONS

const OUTLINE_VARIANTS = {
  play: 'play-outline',
  pause: 'pause-outline',
  albums: 'albums-outline',
  library: 'albums-outline',
  musicLibrary: 'albums-outline',
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

export function Icon({ name, size = iconSize.md, color, filled = true }: IconProps) {
  const colors = useThemeColors()
  const resolvedColor = color ?? colors.iconMid
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
          stroke={resolvedColor}
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
  if (name === 'lyrics') {
    // 1:1 复刻 Apple Music 原生 quote.bubble.fill：实心圆润对话气泡 + 内部反白镂空两枚逗号状引号
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
        >
          <Path
            fill={resolvedColor}
            fillRule="evenodd"
            d="M 7.247,21.361 Q 6.906,21.361 6.718,21.137 Q 6.530,20.914 6.530,20.537 L 6.530,17.875 L 6.004,17.875 Q 4.719,17.875 3.825,17.406 Q 2.930,16.938 2.465,16.047 Q 2.000,15.156 2.000,13.885 L 2.000,6.643 Q 2.000,5.372 2.465,4.478 Q 2.930,3.583 3.825,3.111 Q 4.719,2.639 6.004,2.639 L 17.996,2.639 Q 19.281,2.639 20.175,3.111 Q 21.070,3.583 21.535,4.478 Q 22.000,5.372 22.000,6.643 L 22.000,13.885 Q 22.000,15.149 21.535,16.043 Q 21.070,16.938 20.175,17.406 Q 19.281,17.875 17.996,17.875 L 11.471,17.875 L 8.155,20.864 Q 7.879,21.113 7.680,21.237 Q 7.481,21.361 7.247,21.361 Z M 7.460,9.291 Q 7.460,10.087 7.928,10.626 Q 8.397,11.166 9.192,11.166 Q 9.497,11.166 9.774,11.081 Q 10.051,10.995 10.243,10.761 L 10.321,10.761 Q 10.151,11.173 9.859,11.478 Q 9.568,11.783 9.238,11.979 Q 8.908,12.174 8.624,12.252 Q 8.368,12.316 8.280,12.426 Q 8.191,12.536 8.191,12.692 Q 8.191,12.863 8.315,12.983 Q 8.439,13.104 8.631,13.104 Q 8.965,13.104 9.441,12.898 Q 9.916,12.692 10.378,12.263 Q 10.839,11.833 11.148,11.180 Q 11.457,10.527 11.457,9.639 Q 11.457,8.993 11.194,8.486 Q 10.931,7.978 10.474,7.687 Q 10.016,7.396 9.419,7.396 Q 8.865,7.396 8.422,7.641 Q 7.978,7.886 7.719,8.315 Q 7.460,8.745 7.460,9.291 Z M 12.557,9.291 Q 12.557,10.087 13.026,10.626 Q 13.494,11.166 14.283,11.166 Q 14.588,11.166 14.868,11.081 Q 15.149,10.995 15.340,10.761 L 15.419,10.761 Q 15.248,11.173 14.957,11.478 Q 14.666,11.783 14.336,11.979 Q 14.006,12.174 13.715,12.252 Q 13.466,12.316 13.377,12.426 Q 13.289,12.536 13.289,12.692 Q 13.289,12.863 13.413,12.983 Q 13.537,13.104 13.729,13.104 Q 14.062,13.104 14.538,12.898 Q 15.014,12.692 15.475,12.263 Q 15.937,11.833 16.242,11.180 Q 16.547,10.527 16.547,9.639 Q 16.547,8.993 16.285,8.486 Q 16.022,7.978 15.561,7.687 Q 15.099,7.396 14.510,7.396 Q 13.956,7.396 13.512,7.641 Q 13.069,7.886 12.813,8.315 Q 12.557,8.745 12.557,9.291 Z"
          />
        </Svg>
      </View>
    )
  }
  const outline = (OUTLINE_VARIANTS as Partial<Record<IconName, GlyphName>>)[name]
  const glyph: GlyphName = !filled && outline ? outline : ICONS[name]
  return <Ionicons name={glyph} size={size} color={resolvedColor} />
}

export interface IconButtonProps extends Partial<IconProps> {
  name?: IconName
  onPress: () => void
  /** 无障碍标签必填：纯图标按钮没有可读文本 */
  accessibilityLabel: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  isActive?: boolean
  loading?: boolean
}

/** 纯图标按钮：命中区固定撑到 44×44（iOS HIG 最小可点面积），视觉大小不受影响；支持 loading 状态 */
export function IconButton({
  onPress,
  accessibilityLabel,
  disabled = false,
  style,
  isActive,
  loading = false,
  ...icon
}: IconButtonProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const iconSizeValue = icon.size ?? iconSize.md
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
      accessibilityLabel={loading ? '正在加载' : accessibilityLabel}
      accessibilityState={{ disabled, selected: isActive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          size={iconSizeValue >= 36 ? 'large' : 'small'}
          color={icon.color || colors.iconBright}
        />
      ) : icon.name ? (
        <Icon name={icon.name} {...icon} />
      ) : null}
    </Pressable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  buttonActive: { backgroundColor: colors.bgListItemActive },
  buttonPressed: { backgroundColor: colors.bgListItemHover },
}))
