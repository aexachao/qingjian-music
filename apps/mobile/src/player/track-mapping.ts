import type { MusicProvider } from '@qj/provider-api'
import type { QueueItem, Track } from '@qj/core-domain'
import { type AudioCacheTarget, cachedAudioUri } from './audio-cache'
import { downloadedContentType, downloadedUri } from './downloads'
import { contentTypeFor } from './audio-cache-policy'
import { needsTranscode } from './format-support'
import { cachedTranscodeUri } from './transcode-cache'
import { QueueOccurrenceIds } from './queue-occurrence'

export const ARTWORK_SIZE = 600

const queueOccurrenceIds = new QueueOccurrenceIds()

export function nextQueueId(serverId: string, trackId: string): string {
  return queueOccurrenceIds.create(serverId, trackId)
}

/** 领域曲目 → 队列元素（带鉴权头的封面地址一并算好，锁屏/车机直接用） */
export function toQueueItem(track: Track, provider: MusicProvider, serverId: string): QueueItem {
  const artwork = track.coverId ?? track.album?.coverId
  const format =
    track.audio?.format ||
    track.audio?.container ||
    track.audio?.codec ||
    (track.audio?.path ? track.audio.path.split('.').pop() : undefined)
  return {
    qid: nextQueueId(serverId, track.id),
    serverId,
    trackId: track.id,
    title: track.title,
    artistText: track.artists.map((artist) => artist.name.trim()).filter(Boolean).join(' / ') || '未知艺术家',
    ...(track.album?.name ? { albumText: track.album.name } : {}),
    ...(track.album?.id ? { albumId: track.album.id } : {}),
    ...(track.artists[0]?.id ? { artistId: track.artists[0].id } : {}),
    ...(track.isFavorite === undefined ? {} : { isFavorite: track.isFavorite }),
    ...(format ? { format } : {}),
    ...(track.audio?.sizeBytes ? { sizeBytes: track.audio.sizeBytes } : {}),
    ...(track.audio?.bitrateBps ? { bitrateBps: track.audio.bitrateBps } : {}),
    ...(track.audio?.sampleRateHz ? { sampleRateHz: track.audio.sampleRateHz } : {}),
    ...(track.audio?.bitDepth ? { bitDepth: track.audio.bitDepth } : {}),
    ...(track.audio?.channels ? { channels: track.audio.channels } : {}),
    durationMs: track.durationMs,
    ...(artwork ? { coverId: artwork, artwork: provider.image(artwork, ARTWORK_SIZE) } : {}),
    // 完整曲目留一份：队列页的历史行要用它做「加入队列 / 下一首播放」（见 QueueItem.track 注释）
    track,
  }
}

export function toCacheTarget(item: QueueItem): AudioCacheTarget {
  return {
    serverId: item.serverId,
    trackId: item.trackId,
    ...(item.format ? { format: item.format } : {}),
    ...(item.sizeBytes ? { sizeBytes: item.sizeBytes } : {}),
  }
}

export type LocalPlaybackResource = { url: string; contentType?: string; kind: 'download' | 'transcode' | 'cache' }

/** Resolve local playback consistently, keeping original downloads in their real container MIME. */
export function resolveLocalPlaybackResource(item: QueueItem): LocalPlaybackResource | undefined {
  const download = downloadedUri(item.serverId, item.trackId)
  if (download) {
    const contentType = downloadedContentType(item.serverId, item.trackId) ?? contentTypeFor(item.format)
    return { url: download, ...(contentType ? { contentType } : {}), kind: 'download' }
  }
  const transcode = cachedTranscodeUri(item.serverId, item.trackId)
  if (transcode) return { url: transcode, contentType: 'audio/mp4', kind: 'transcode' }
  const cached = cachedAudioUri(toCacheTarget(item))
  if (cached) {
    const contentType = contentTypeFor(item.format)
    return { url: cached, ...(contentType ? { contentType } : {}), kind: 'cache' }
  }
  return undefined
}

/** 原生放不了、或上次原生播放失败过的曲目，必须走服务端转码 */
const forcedTranscode = new Set<string>()

export function shouldTranscode(item: QueueItem): boolean {
  return forcedTranscode.has(item.qid) || needsTranscode(item.format)
}

/** 原生播放报错后调用：这首之后一律走转码 */
export function markForcedTranscode(qid: string): boolean {
  if (forcedTranscode.has(qid)) return false
  forcedTranscode.add(qid)
  return true
}

/**
 * 撤销「强制转码」标记。
 *
 * 标记本身是永久的（只有清空队列 / 退出登录才整体清），这对「原生确实解不了」是对的，
 * 但错误分支也可能因为**读不到失败原因**（见 playback-error-policy.ts）而误打标记 ——
 * 一旦误打，同一个 qid 之后每次播放都会被钉在转码路径上。
 * 所以曲目真的放出来了就撤掉：能播说明本来就不该强制转码。
 */
export function clearForcedTranscode(qid: string): void {
  forcedTranscode.delete(qid)
}

/** 整体清空强制转码标记（清空队列 / 退出登录时调用） */
export function resetForcedTranscode(): void {
  forcedTranscode.clear()
}
