import { MusicError, type StreamOptions } from '@qj/core-domain'
import type { FnosClient } from './client'

export const TRANSCODE_HEARTBEAT_MS = 10_000

/**
 * 心跳与 quit 的超时，对齐 web 端实测值（bundle 里的 `ch=3e3`）。
 *
 * 为什么给这么短：这两个调用都在**串行变更队列的关键路径**上 ——
 * `stopTranscodeSession()` 会被 `ensureTranscodeForIndexMutation` await，
 * 用默认的 15s 会把切歌最多拖慢 15 秒。quit 失败也不是灾难：
 * 服务端本来就会按心跳超时（约 1 分钟）自行回收任务。
 */
export const TRANSCODE_SESSION_TIMEOUT_MS = 3_000
export const ROUTE_PROBE_TIMEOUT_MS = 3_000

/**
 * 发起转码的请求超时。
 *
 * 必须给足：这是一次「服务端开始转码」的同步调用，首次遇到大文件时服务端要
 * 先建任务再返回，实测耗时明显长于普通接口。web 端给的是 20s（bundle 里的 `sh=2e4`），
 * 而 HttpClient 的默认超时只有 15s —— 用默认值会在服务端还没来得及返回时就把
 * 自己的请求掐掉，表现为「转码重试失败」，然后一路跳到下一首。
 */
export const TRANSCODE_START_TIMEOUT_MS = 20_000

/**
 * 音质档位 → transcode 的 bitrate。飞牛只认 128/256/320 三档且 codec 恒为 flac，
 * web 端永远只发 320（它的默认音质就是 original）。
 */
export function transcodeBitrate(quality: StreamOptions['quality']): number {
  if (quality === 'low') return 128
  if (quality === 'medium') return 256
  return 320
}

export function canceledTranscode(): MusicError {
  return new MusicError({ code: 'canceled', message: '较新的转码请求已接管当前歌曲' })
}

export interface ActiveTranscodeLease {
  generation: number
  client: FnosClient
}
