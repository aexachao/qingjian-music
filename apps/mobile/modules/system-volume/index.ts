import { requireNativeModule, requireNativeView } from 'expo'
import type { ViewProps } from 'react-native'

interface SystemVolumeSliderProps extends ViewProps {
  onPressedChange?: (event: any) => void
}

/**
 * 系统音量滑杆（原生 MPVolumeView 的透明外壳）。
 *
 * 这是唯一能控制系统音量并且屏蔽系统 HUD 的公开方式。
 * 现在它的轨道已完全透明，用作手势拦截。
 */
export const SystemVolumeSlider = requireNativeView<SystemVolumeSliderProps>('SystemVolume')

const SystemVolumeModule = requireNativeModule('SystemVolume')

let lastKnownVolume = 0.5

export function getSystemVolume(): number {
  try {
    if (typeof SystemVolumeModule?.getSystemVolume === 'function') {
      const vol = SystemVolumeModule.getSystemVolume()
      if (typeof vol === 'number' && !isNaN(vol)) {
        lastKnownVolume = vol
        return vol
      }
    }
  } catch {}
  return lastKnownVolume
}

export function addVolumeListener(listener: (event: { volume: number }) => void): { remove: () => void } {
  return SystemVolumeModule.addListener('onVolumeChange', (event: { volume: number }) => {
    if (typeof event?.volume === 'number' && !isNaN(event.volume)) {
      lastKnownVolume = event.volume
    }
    listener(event)
  })
}

export async function setSystemVolume(volume: number): Promise<void> {
  lastKnownVolume = volume
  await SystemVolumeModule.setSystemVolume(volume)
}
