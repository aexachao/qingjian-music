import { requireNativeView } from 'expo'
import type { ColorValue, ViewProps } from 'react-native'

export interface AirplayRouteButtonProps extends ViewProps {
  tintColor?: ColorValue
  activeTintColor?: ColorValue
}

/**
 * 系统 AirPlay 输出设备选择按钮（原生 AVRoutePickerView）。
 * 点按弹出 iOS 输出设备选择面板，颜色由运行时主题传入。
 */
export const AirplayRouteButton = requireNativeView<AirplayRouteButtonProps>('AirplayButton')
