import { requireNativeModule } from 'expo'
import type { ViewProps } from 'react-native'

interface SystemVolumeSliderProps extends ViewProps {
  onPressedChange?: (event: any) => void
}

/**
 * Android 不需要 iOS 那种「幽灵 MPVolumeView」：
 * 直接调 AudioManager.setStreamVolume(..., flags = 0) 就不会弹系统音量 HUD，
 * 所以这个组件渲染 null。调用方用 absoluteFill + pointerEvents="none" 包着它，
 * 渲染 null 不会有任何副作用。
 */
export function SystemVolumeSlider(_props: SystemVolumeSliderProps) {
  return null
}

const SystemVolumeModule = requireNativeModule('SystemVolume')

let lastKnownVolume = 0.5

export function getSystemVolume(): number {
  try {
    const vol = SystemVolumeModule.getSystemVolume()
    if (typeof vol === 'number' && !Number.isNaN(vol)) {
      lastKnownVolume = vol
      return vol
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
