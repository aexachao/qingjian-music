export const APP_ICON_IDS = [
  'dark-bars',
  'crimson-glass',
  'gold-glow',
  'crimson-bars',
] as const

export type AppIconId = (typeof APP_ICON_IDS)[number]

export async function getAppIcon(): Promise<AppIconId> {
  return 'crimson-glass'
}

export async function setAppIcon(_iconId: AppIconId): Promise<void> {
  throw new Error('当前平台不支持切换桌面图标')
}

export async function supportsAlternateIcons(): Promise<boolean> {
  return false
}
