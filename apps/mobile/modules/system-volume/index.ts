import { requireNativeView } from 'expo'
import type { ViewProps } from 'react-native'

/**
 * 系统音量滑杆（原生 MPVolumeView）。
 *
 * 这是唯一能控制系统音量的公开方式：iOS 没有设置音量的公开 API。
 * 只能用户拖动，两侧的喇叭图标由 App 画。仅 iOS 有。
 */
export const SystemVolumeSlider = requireNativeView<ViewProps>('SystemVolume')
