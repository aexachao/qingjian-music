import TrackPlayer, { AppKilledPlaybackBehavior, Capability, IOSCategoryMode } from 'react-native-track-player'

let setupPromise: Promise<void> | null = null

/** 幂等初始化：任何入口（列表点播、锁屏、后续 CarPlay）都先 await 它 */
export function ensurePlayer(): Promise<void> {
  setupPromise ??= initialize()
  return setupPromise
}

async function initialize(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      iosCategoryMode: IOSCategoryMode.Default,
      // 网络流的缓冲：给弱 Wi-Fi 留一点余量
      minBuffer: 15,
      maxBuffer: 60,
      backBuffer: 30,
    })
  } catch (error) {
    // 热重载时播放器可能已初始化，这不是错误
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already initialized')) throw error
  }

  await TrackPlayer.updateOptions({
    // 锁屏 / 控制中心 / 车机能用的能力
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
    ],
    progressUpdateEventInterval: 1,
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
  })
}
