import { Platform, type ColorValue, type ViewProps } from 'react-native'
import { requireNativeView } from 'expo'

export interface AirplayRouteButtonProps extends ViewProps {
  tintColor?: ColorValue
  activeTintColor?: ColorValue
}

/**
 * 系统 AirPlay 输出设备选择按钮（原生 `AVRoutePickerView`）。
 * 点按弹出 iOS 输出设备选择面板，颜色由运行时主题传入。
 *
 * Android 没有等价控件（音频路由由系统接管），渲染 `null` 即可。
 *
 * ⚠️ 与 `system-volume` 同理：**不要**用 `index.android.tsx` 承载这个分支。
 * Metro 的扩展名优先序里 `ts` 排在 `android.tsx` 之前，同目录只要存在 `index.ts`，
 * 平台文件就会被静默遮蔽（构建/类型检查/单测都发现不了）。
 * 完整说明见 `modules/system-volume/index.ts` 的注释。
 */
export const AirplayRouteButton = Platform.OS === 'ios'
  ? requireNativeView<AirplayRouteButtonProps>('AirplayButton')
  : function AirplayRouteButton(_props: AirplayRouteButtonProps) {
      return null
    }
