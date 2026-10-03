import { NativeModules, Platform } from 'react-native'

/** Promote only an inactive entry; older binaries/platforms keep the activation fallback. */
export async function promoteUpcomingTrackSource(
  qid: string,
  expectedURL: string,
  local: { url: string; contentType?: string },
): Promise<boolean> {
  const module = NativeModules.TrackPlayerModule
  if (Platform.OS !== 'ios' || !local.url.startsWith('file://') ||
      typeof module?.promoteUpcomingTrackSource !== 'function') return false
  return module.promoteUpcomingTrackSource(qid, expectedURL, local)
}
