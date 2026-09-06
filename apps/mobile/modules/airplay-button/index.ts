import { requireNativeView } from 'expo'
import type { ViewProps } from 'react-native'

/**
 * 系统 AirPlay 输出设备选择按钮（原生 AVRoutePickerView）。
 *
 * 图标是系统 AirPlay 自己的图形：白色为未连接，连上后变强调红。
 * 点按弹出 iOS 的输出设备选择面板。仅 iOS 有；
 * Android（M7）要换成对应的输出设备选择方式。
 */
export const AirplayRouteButton = requireNativeView<ViewProps>('AirplayButton')
