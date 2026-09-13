import { useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LyricSheet } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import { useServerSession } from '@/lib/server-session'
import { readCachedLyric, writeCachedLyric } from '@/lib/lyric-cache'
import { usePlayerStore } from '@/player/store'

/** 每次调整多少毫秒 */
export const OFFSET_STEP_MS = 500
/** 写回防抖：与 web 端一致的 700ms，避免连点时把每一次都发出去 */
const WRITEBACK_DELAY_MS = 700

/** 把偏移毫秒显示成「+0.5 秒」这种人话 */
export function formatOffset(offsetMs: number): string {
  if (offsetMs === 0) return '0 秒'
  const sign = offsetMs > 0 ? '+' : '-'
  return `${sign}${(Math.abs(offsetMs) / 1000).toFixed(1)} 秒`
}

/** 歌词几乎不变，缓存久一点省请求 */
export const LYRIC_STALE_MS = 30 * 60_000

/** 歌词查询 key。hook 与「分享歌词」这类命令式读取共用，避免两处 key 漂移 */
export function lyricQueryKey(serverId: string | undefined, trackId: string) {
  return ['lyrics', serverId, trackId] as const
}

/** lyrics 是能力可选方法：后端不支持时直接当作没有歌词 */
export function fetchLyricSheet(
  provider: Pick<MusicProvider, 'lyrics'> | null | undefined,
  trackId: string,
): Promise<LyricSheet | null> {
  return provider?.lyrics ? provider.lyrics(trackId) : Promise.resolve(null)
}

/**
 * 取歌词：**本地优先**。
 * 本地命中（按「逐字 > 整行 > 纯文本」取最好的一份）就直接返回，不发请求；
 * 未命中才打服务端，并把选中的那份写回本地。
 */
export async function loadLyricSheet(
  provider: Pick<MusicProvider, 'lyrics'> | null | undefined,
  serverId: string | undefined,
  trackId: string,
): Promise<LyricSheet | null> {
  if (serverId) {
    const cached = readCachedLyric(serverId, trackId)
    if (cached) return cached
  }
  const sheet = await fetchLyricSheet(provider, trackId)
  if (sheet && serverId) writeCachedLyric(serverId, trackId, sheet)
  return sheet
}

/** 当前曲目的歌词。歌词页、播放页「···」菜单、分享歌词共用同一份缓存 */
export function useLyricSheet(trackId: string) {
  const { provider, connection } = useServerSession()
  return useQuery<LyricSheet | null>({
    queryKey: lyricQueryKey(connection?.id, trackId),
    enabled: Boolean(provider && trackId),
    queryFn: () => loadLyricSheet(provider, connection?.id, trackId),
    staleTime: LYRIC_STALE_MS,
  })
}

/**
 * 歌词偏移：调整、防抖写回服务端、换歌时用服务端保存的值作初值。
 *
 * 偏移入口放在播放页的「···」菜单里，歌词页只负责显示，
 * 这样歌词页和播放器页下方的组件位置完全一致，也方便做歌词全屏。
 */
export function useLyricOffset(trackId: string) {
  const { provider } = useServerSession()
  const { data: sheet } = useLyricSheet(trackId)
  const offsetMs = usePlayerStore((state) => state.lyricOffsetMs)
  const setLyricOffsetMs = usePlayerStore((state) => state.setLyricOffsetMs)

  const lyricId = sheet?.id
  const canWriteback = Boolean(provider?.setLyricOffset && provider.capabilities.lyricOffsetWriteback && lyricId)

  // 换歌后用服务端保存的偏移作为初值（store 里的偏移是全局单值）
  const seededTrackId = useRef<string | null>(null)
  useEffect(() => {
    if (!sheet || seededTrackId.current === trackId) return
    seededTrackId.current = trackId
    setLyricOffsetMs(sheet.offsetMs)
  }, [sheet, trackId, setLyricOffsetMs])

  const pending = useRef<{ trackId: string; lyricId: string; offsetMs: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const next = pending.current
    pending.current = null
    if (!next || !provider?.setLyricOffset) return
    void provider.setLyricOffset(next).catch((error: unknown) => {
      // 写回失败只影响下次进来的初值，不打断播放
      console.warn('歌词偏移写回失败', error)
    })
  }, [provider])

  // 换歌或退出播放页时把没发出去的改动补发
  useEffect(() => () => flush(), [flush, trackId])

  const adjust = useCallback(
    (deltaMs: number) => {
      const next = offsetMs + deltaMs
      setLyricOffsetMs(next)
      if (!canWriteback || !lyricId) return
      pending.current = { trackId, lyricId, offsetMs: next }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, WRITEBACK_DELAY_MS)
    },
    [canWriteback, flush, lyricId, offsetMs, setLyricOffsetMs, trackId],
  )

  return {
    offsetMs,
    adjust,
    /** 有时间轴才有「偏移」的意义 */
    canAdjust: Boolean(sheet?.synced),
  }
}
