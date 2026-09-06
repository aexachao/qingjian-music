import { requireNativeView } from 'expo'
import type { ViewProps } from 'react-native'

/**
 * 系统 AirPlay 输出设备选择按钮（原生 AVRoutePickerView）。
 *
 * 用法：铺在自己的图标上面，透明度留一点点（UIKit 对 alpha < 0.01 的视图不派发点击）。
 * 仅 iOS 有；Android（M7）要换成对应的输出设备选择方式。
 */
export const AirplayRouteButton = requireNativeView<ViewProps>('AirplayButton')
