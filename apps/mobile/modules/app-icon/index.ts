import { requireNativeModule } from 'expo'

export const APP_ICON_IDS = [
  'dark-bars',
  'gold-glow',
  'crimson-bars',
] as const

export type AppIconId = (typeof APP_ICON_IDS)[number]

type AppIconNativeModule = {
  getAppIcon(): Promise<AppIconId>
  setAppIcon(iconId: AppIconId): Promise<void>
  supportsAlternateIcons(): Promise<boolean>
}

const nativeModule = requireNativeModule<AppIconNativeModule>('AppIcon')

export function getAppIcon(): Promise<AppIconId> {
  return nativeModule.getAppIcon()
}

export function setAppIcon(iconId: AppIconId): Promise<void> {
  return nativeModule.setAppIcon(iconId)
}

export function supportsAlternateIcons(): Promise<boolean> {
  return nativeModule.supportsAlternateIcons()
}
