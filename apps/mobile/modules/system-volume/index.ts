import { Platform, type ViewProps } from 'react-native'
import { requireNativeModule, requireNativeView } from 'expo'

interface SystemVolumeSliderProps extends ViewProps {
  onPressedChange?: (event: any) => void
}

/**
 * 系统音量滑杆。
 *
 * - **iOS**：原生 `MPVolumeView` 的透明外壳。这是唯一能改系统音量、又屏蔽系统音量
 *   HUD 的公开方式。轨道已完全透明，只用来拦截手势。
 * - **Android**：**不需要视图** —— 直接 `AudioManager.setStreamVolume(..., flags = 0)`
 *   就不会弹 HUD。所以这里返回一个渲染 `null` 的组件；调用方用
 *   `absoluteFill + pointerEvents="none"` 包着它，渲染 null 没有任何副作用。
 *
 * ⚠️ **为什么平台差异走运行时分支，而不是 `index.android.tsx` 平台文件**
 *
 * Metro 解析目录时按扩展名优先序试候选，实测顺序是：
 *
 *     .android.ts → .native.ts → .ts → .android.tsx → .native.tsx → .tsx → …
 *
 * 注意 **`ts` 排在 `android.tsx` 前面**。所以同目录只要存在 `index.ts`，平台文件
 * `index.android.tsx` **永远不会被选中** —— 它是静默死代码：构建不报错、类型检查通过、
 * 单测全绿，只有真机点开那一屏才炸。
 *
 * 本模块就踩过这个坑：Android 包里打进了上面那个 iOS 的 `requireNativeView`，点开播放页
 * 时 Fabric 找不到 `ViewManagerAdapter_SystemVolume`，抛 `IllegalViewOperationException`
 * → 进程 SIGABRT，而且**屏幕上什么都不显示**（崩在渲染阶段，错误屏还没机会挂载）。
 *
 * 所以：**不要**把这个模块拆成 `index.android.tsx`。要用平台文件，扩展名必须写成
 * `.android.ts`（不能用 `.tsx`）；否则就像现在这样在运行时按 `Platform.OS` 分支。
 */
export const SystemVolumeSlider = Platform.OS === 'ios'
  ? requireNativeView<SystemVolumeSliderProps>('SystemVolume')
  : function SystemVolumeSlider(_props: SystemVolumeSliderProps) {
      return null
    }

const SystemVolumeModule = requireNativeModule('SystemVolume')

let lastKnownVolume = 0.5

export function getSystemVolume(): number {
  try {
    if (typeof SystemVolumeModule?.getSystemVolume === 'function') {
      const vol = SystemVolumeModule.getSystemVolume()
      if (typeof vol === 'number' && !Number.isNaN(vol)) {
        lastKnownVolume = vol
        return vol
      }
    }
  } catch {
    // 原生模块不可用（例如尚未 prebuild）时退回上次已知值，音量条至少能显示
  }
  return lastKnownVolume
}

export function addVolumeListener(listener: (event: { volume: number }) => void): { remove: () => void } {
  return SystemVolumeModule.addListener('onVolumeChange', (event: { volume: number }) => {
    if (typeof event?.volume === 'number' && !Number.isNaN(event.volume)) {
      lastKnownVolume = event.volume
    }
    listener(event)
  })
}

export async function setSystemVolume(volume: number): Promise<void> {
  lastKnownVolume = volume
  await SystemVolumeModule.setSystemVolume(volume)
}
