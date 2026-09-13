import { getNetworkStateAsync, NetworkStateType } from 'expo-network'
import type { QualityOption } from './audio-quality-preferences'

export type PlaybackNetworkType = 'wifi' | 'cellular' | 'unknown'
export type StreamQuality = 'original' | 'medium'

export function selectPlaybackQuality(
  networkType: PlaybackNetworkType,
  preferences: { wifiQuality: QualityOption; cellularQuality: QualityOption },
  /**
   * 后端是否真的能按码率档位输出（`capabilities.qualityTiers`）。
   *
   * 为 false 时必须恒返回 `original`：那种后端只有一档输出，选「标准音质」既省不了
   * 流量，又会让**每一首歌**都被判定为「需要转码」而走上服务端转码链路 ——
   * 等于用一个不存在的收益去换整条播放链路的稳定性。
   * 已知飞牛为 false（转码恒输出无损 FLAC，服务端忽略 bitrate）。
   */
  supportsQualityTiers: boolean,
): StreamQuality {
  if (!supportsQualityTiers) return 'original'
  // 未知网络保守按蜂窝设置处理，绝不误用 Wi-Fi 的高音质偏好。
  const preference = networkType === 'wifi' ? preferences.wifiQuality : preferences.cellularQuality
  return preference === 'standard' ? 'medium' : 'original'
}

export async function getPlaybackNetworkType(): Promise<PlaybackNetworkType> {
  try {
    const state = await getNetworkStateAsync()
    if (state.type === NetworkStateType.WIFI || state.type === NetworkStateType.ETHERNET) return 'wifi'
    if (state.type === NetworkStateType.CELLULAR) return 'cellular'
  } catch {
    // 原生网络模块暂不可用时走保守回退。
  }
  return 'unknown'
}
