import { Platform } from 'react-native'
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategoryMode,
  type UpdateOptions,
} from 'react-native-track-player'

let setupPromise: Promise<void> | null = null

/**
 * 幂等初始化：任何入口（列表点播、锁屏、后续 CarPlay）都先 await 它。
 *
 * **失败的初始化绝不能留在缓存里**：`setupPromise ??= initialize()` 这种写法一旦
 * initialize 抛错，缓存下来的就是一个 rejected promise —— 之后每个入口 await 它都会
 * 立刻抛，播放/暂停、上下一首、点歌全部没反应，而且不重启 App 永远恢复不了。
 *
 * 所以失败时把缓存清掉：下一次调用会重新初始化。重试是安全的 ——
 * `setupPlayer` 对「已经初始化过」是幂等的（见 initialize 里的 already initialized 分支），
 * `updateOptions` 本身也是可重复调用。
 */
export function ensurePlayer(): Promise<void> {
  setupPromise ??= initialize().catch((error: unknown) => {
    setupPromise = null
    throw error
  })
  return setupPromise
}

async function initialize(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      iosCategoryMode: IOSCategoryMode.Default,
      /**
       * 缓冲参数只给 Android（ExoPlayer）。
       * iOS 上 RNTP 会把 minBuffer 换算成 SwiftAudioEx 的 bufferDuration，
       * 而 bufferDuration > 0 会连带关掉 automaticallyWaitsToMinimizeStalling；
       * 实测这会让 HLS（转码流）停在 0 秒不动：AVPlayer 报 readyToPlay、
       * 缓冲也满了，但时基永远不启动。直推的本地/网络文件不受影响，
       * 所以这个坑只在转码路径上炸。
       */
      ...(Platform.OS === 'android' ? { minBuffer: 15, maxBuffer: 60, backBuffer: 30 } : {}),
    })
  } catch (error) {
    // 热重载 / Fast Refresh 时原生播放器可能已经初始化过，这不是错误。
    //
    // ⚠️ 这里曾经写成 `message.includes('already initialized')` —— 看着没问题，实际
    // **从来没有命中过**：RNTP 三端抛出的原文都是
    //   "The player has already been initialized via setupPlayer."
    // 中间多一个 "been"，所以子串匹配恒为 false。后果是热重载后每一次
    // `ensurePlayer()` 都直接 reject，播放/暂停/切歌/点歌全部没反应。
    // 这类「字符串近似但不等」的容错分支不会报错、只会静默失效，所以：
    //   1. 匹配放宽成「同时出现 already 与 initialized」，并优先看错误码；
    //   2. 由 test/unit/player-setup-resilience.test.ts 钉住行为，
    //      同时核对 RNTP 原生源码里的消息原文，改版走样会被测出来。
    const code = (error as { code?: unknown } | null)?.code
    const message = error instanceof Error ? error.message : String(error)
    const alreadyInitialized =
      code === 'player_already_initialized' ||
      (/already/.test(message) && /initialized/.test(message))
    if (!alreadyInitialized) throw error
  }

  await applyPlayerOptions()
}

/**
 * 系统播放控制的选项。
 *
 * updateOptions 是整体替换而不是合并，所以「收藏」状态变了也要把这一整份重发一遍，
 * 不能只发 likeOptions，否则其它能力会被清掉。
 */
function buildOptions(): UpdateOptions {
  return {
    // 锁屏 / 控制中心 / 车机能用的能力
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
      // 收藏：iOS 走 MPFeedbackCommand（车机与系统播放控制上的「喜欢」）
      Capability.Like,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
    ],
    likeOptions: { isActive: likeActive, title: likeActive ? '取消收藏' : '收藏' },
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
  }
}

let likeActive = false

async function applyPlayerOptions(): Promise<void> {
  await TrackPlayer.updateOptions(buildOptions())
}

/** 把当前曲目的收藏状态同步到系统播放控制（锁屏 / 车机上的心形按钮） */
export async function setLikeState(active: boolean): Promise<void> {
  if (active === likeActive) return
  likeActive = active
  if (!setupPromise) return
  await applyPlayerOptions()
}
