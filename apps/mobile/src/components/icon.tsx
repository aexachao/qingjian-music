import type { ComponentProps } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { LYRICS_FILLED_PATH, LYRICS_OUTLINE_PATH, LYRICS_QUOTES_PATH, QUEUE_FILLED_PATH } from './player-mode-glyphs'
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
  lyricAdjust: 'options-outline',
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
  // 排序菜单右侧的升降序箭头
  arrowUp: 'arrow-up',
  arrowDown: 'arrow-down',
  close: 'close',
  check: 'checkmark',
  // 音乐库分类
  albums: 'albums',
  artists: 'person-circle-outline',
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
  playbackSettings: 'play-circle-outline',
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
  dataSource: 'cloud-outline',
  // 通用动作
  add: 'add',
  more: 'ellipsis-horizontal',
  sort: 'swap-vertical',
  select: 'checkmark-circle-outline',
  remove: 'remove',
  trash: 'trash',
  importPlaylist: 'add-circle',
  info: 'information-circle-outline',
  eye: 'eye-outline',
  eyeOff: 'eye-off-outline',
  history: 'time-outline',
  circle: 'ellipse-outline',
  // 半选（多选顶部条的三态图标用）
  circleIndeterminate: 'remove-circle',
  checkmarkCircle: 'checkmark-circle',
  clear: 'close-circle',
} satisfies Record<string, GlyphName>

export type IconName = keyof typeof ICONS

const OUTLINE_VARIANTS = {
  play: 'play-outline',
  pause: 'pause-outline',
  next: 'play-forward-outline',
  heart: 'heart-outline',
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
  'person.crop.circle': 'artists',
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
  if (name === 'lyrics' || name === 'queue') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {filled ? (
          <Path d={name === 'lyrics' ? LYRICS_FILLED_PATH : QUEUE_FILLED_PATH} fill={resolvedColor} fillRule="evenodd" />
        ) : name === 'lyrics' ? (
          <>
            <Path d={LYRICS_OUTLINE_PATH} stroke={resolvedColor} strokeWidth={1.7} strokeLinejoin="round" />
            <Path d={LYRICS_QUOTES_PATH} fill={resolvedColor} />
          </>
        ) : (
          <>
            {[5, 12, 19].map((y) => <Circle key={y} cx={3} cy={y} r={1.1} stroke={resolvedColor} strokeWidth={1.3} />)}
            <Path d="M8 5h13 M8 12h13 M8 19h13" stroke={resolvedColor} strokeWidth={1.7} strokeLinecap="round" />
          </>
        )}
      </Svg>
    )
  }
  if (name === 'lyricAdjust') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={resolvedColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M2.5 5.5h12 M8.5 5.5v13 M5.5 18.5h6 M17 10l2-2 2 2 M17 15l2 2 2-2" />
        </Svg>
      </View>
    )
  }
  if (name === 'select') {
    // 列表多选：左上勾选框 + 左下对勾 + 右侧 3 根横线列表
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={resolvedColor}
          strokeWidth={2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M4.1 3.8h4a1.6 1.6 0 0 1 1.6 1.6v3.2a1.6 1.6 0 0 1-1.6 1.6h-4a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6z M2.8 15.6l2.8 3 4-5 M12.5 5h9 M12.5 11h9 M12.5 17h9" />
        </Svg>
      </View>
    )
  }
  if (name === 'sort') {
    // 列表排序/筛选：3 条水平居中、逐级递减的圆头横线
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={resolvedColor}
          strokeWidth={2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M2.5 5h19 M5.8 11h12.4 M9.2 17h5.6" />
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
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={loading ? '正在加载' : accessibilityLabel}
      accessibilityState={{ disabled, selected: isActive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          size={iconSizeValue >= 36 ? 'large' : 'small'}
          color={colors.loadingIndicator}
        />
      ) : icon.name ? (
        <Icon name={icon.name} {...icon} color={disabled ? (icon.color ? icon.color : colors.textTertiary) : icon.color} />
      ) : null}
    </Pressable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  buttonActive: { backgroundColor: colors.bgListItemActive },
  buttonPressed: { backgroundColor: colors.bgListItemHover },
  buttonDisabled: { opacity: 0.32 },
}))
