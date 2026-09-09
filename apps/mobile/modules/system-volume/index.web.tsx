import type { ViewProps } from 'react-native'

export function SystemVolumeSlider(_props: ViewProps) {
  return null
}

let lastKnownVolume = 0.5

export function getSystemVolume(): number {
  return lastKnownVolume
}

export function addVolumeListener(_listener: (event: { volume: number }) => void): { remove: () => void } {
  return { remove: () => undefined }
}

export async function setSystemVolume(volume: number): Promise<void> {
  lastKnownVolume = volume
}
