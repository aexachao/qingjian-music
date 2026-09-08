import type { ViewProps } from 'react-native'

export function SystemVolumeSlider(_props: ViewProps) {
  return null
}

export function addVolumeListener(_listener: (event: { volume: number }) => void): { remove: () => void } {
  return { remove: () => undefined }
}

export async function setSystemVolume(_volume: number): Promise<void> {}
