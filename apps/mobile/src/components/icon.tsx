import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
// 逐个图标深导入：从 'lucide-react-native' 桶入口导入会把 3600+ 个图标模块全打进 bundle
import AudioLines from 'lucide-react-native/icons/audio-lines'
import Check from 'lucide-react-native/icons/check'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import Clock from 'lucide-react-native/icons/clock'
import Disc3 from 'lucide-react-native/icons/disc-3'
import GripVertical from 'lucide-react-native/icons/grip-vertical'
import Guitar from 'lucide-react-native/icons/guitar'
import Heart from 'lucide-react-native/icons/heart'
import LibraryBig from 'lucide-react-native/icons/library-big'
import ListMusic from 'lucide-react-native/icons/list-music'
import LogOut from 'lucide-react-native/icons/log-out'
import MicVocal from 'lucide-react-native/icons/mic-vocal'
import Music from 'lucide-react-native/icons/music'
import Pause from 'lucide-react-native/icons/pause'
import Play from 'lucide-react-native/icons/play'
import Plus from 'lucide-react-native/icons/plus'
import Radio from 'lucide-react-native/icons/radio'
import Repeat from 'lucide-react-native/icons/repeat'
import Repeat1 from 'lucide-react-native/icons/repeat-1'
import Search from 'lucide-react-native/icons/search'
import Server from 'lucide-react-native/icons/server'
import Settings from 'lucide-react-native/icons/settings'
import Shuffle from 'lucide-react-native/icons/shuffle'
import SkipBack from 'lucide-react-native/icons/skip-back'
import SkipForward from 'lucide-react-native/icons/skip-forward'
import Sparkles from 'lucide-react-native/icons/sparkles'
import Trash from 'lucide-react-native/icons/trash'
import X from 'lucide-react-native/icons/x'
import { colors } from '@/theme/tokens'

/**
 * 全 App 唯一的图标出口。
 *
 * 用 lucide —— 和飞牛音乐 web 端同一套图标库（web 端用的是 lucide-react），
 * 这样两端图标语言完全一致，iOS / Android 也共用同一份矢量图形。
 * **禁止用 emoji 当图标**：emoji 各平台字形不同、无法跟随强调色、也没有描边粗细可言。
 */

/** 尺寸只开这四档，避免每个页面自己发明大小 */
export const iconSize = { sm: 16, md: 20, lg: 24, xl: 28 } as const

const ICONS = {
  play: Play,
  pause: Pause,
  next: SkipForward,
  previous: SkipBack,
  shuffle: Shuffle,
  repeat: Repeat,
  repeatOne: Repeat1,
  heart: Heart,
  queue: ListMusic,
  drag: GripVertical,
  playing: AudioLines,
  search: Search,
  settings: Settings,
  library: LibraryBig,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  close: X,
  check: Check,
  albums: Disc3,
  artists: MicVocal,
  tracks: Music,
  genres: Guitar,
  playlists: ListMusic,
  recentlyAdded: Sparkles,
  recentlyPlayed: Clock,
  radio: Radio,
  server: Server,
  signOut: LogOut,
  add: Plus,
  trash: Trash,
} as const

export type IconName = keyof typeof ICONS

/**
 * 领域层 BrowseNode.icon 存的是 SF Symbols 名（为 CarPlay 预留），
 * 这里映射到同一套 lucide 图标，两处不会各写一份图标表。
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
}

export function iconForSymbol(symbol: string): IconName {
  return SF_SYMBOL_ALIASES[symbol] ?? 'tracks'
}

export interface IconProps {
  name: IconName
  size?: number
  color?: string
  /** 实心（收藏已选中、正在播放等状态用） */
  filled?: boolean
  strokeWidth?: number
}

export function Icon({ name, size = iconSize.md, color = colors.iconMid, filled = false, strokeWidth = 2 }: IconProps) {
  const Glyph = ICONS[name]
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} {...(filled ? { fill: color } : {})} />
}

export interface IconButtonProps extends IconProps {
  onPress: () => void
  /** 无障碍标签必填：纯图标按钮没有可读文本 */
  accessibilityLabel: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

/** 纯图标按钮：命中区固定撑到 44×44（iOS HIG 最小可点面积），视觉大小不受影响 */
export function IconButton({
  onPress,
  accessibilityLabel,
  disabled = false,
  style,
  ...icon
}: IconButtonProps) {
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
