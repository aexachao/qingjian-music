import { useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useServerSession } from '@/lib/server-session'
import { lyricQueryOptions, type LyricQueryMeta } from '@/lib/lyric-loader'
import { externalSourceCacheIdentity } from '@/lib/external-source-cache-key'
import { useExternalSourcesStore } from '@/lib/external-source'
import { selectCurrent, usePlayerStore } from '@/player/store'

export {
  fetchLyricSheet,
  loadLyricSheet,
  lyricQueryKey,
  lyricQueryOptions,
  LYRIC_RETRY_STALE_MS,
  LYRIC_STALE_MS,
} from '@/lib/lyric-loader'

/** 每次调整多少毫秒（0.1 秒精细微调） */
export const OFFSET_STEP_MS = 100
/** 写回防抖：与 web 端一致的 700ms，避免连点时把每一次都发出去 */
const WRITEBACK_DELAY_MS = 700

/** 歌词进度状态文案（对齐 Apple 规范）：如「歌词进度 正常」或「歌词进度 提前 0.1 秒」 */
export function formatProgressStatus(offsetMs: number): string {
  if (Math.abs(offsetMs) < 10) return '歌词进度 正常'
  const seconds = (Math.abs(offsetMs) / 1000).toFixed(1)
  const action = offsetMs > 0 ? '提前' : '延后'
  return `歌词进度 ${action} ${seconds} 秒`
}

/** 把偏移毫秒显示成「+0.1 秒」这种人话 */
export function formatOffset(offsetMs: number): string {
  if (Math.abs(offsetMs) < 10) return '0 秒'
  const sign = offsetMs > 0 ? '+' : '-'
  return `${sign}${(Math.abs(offsetMs) / 1000).toFixed(1)} 秒`
}

/** 当前曲目的歌词。歌词页、播放页「···」菜单、分享歌词共用同一份缓存 */
export function useLyricSheet(trackId: string) {
  const { provider, connection } = useServerSession()
  const sourceRevision = useExternalSourcesStore((state) => state.revision)
  const services = useExternalSourcesStore((state) => state.services)
  const sourceIdentity = externalSourceCacheIdentity(services)
  // 外部歌词源（网易云/LrcAPI）靠歌名+艺人搜索，从当前队列项拿元数据
  const current = usePlayerStore(selectCurrent)
  const meta: LyricQueryMeta | undefined =
    current && current.trackId === trackId
      ? { title: current.title, artist: current.artistText, album: current.albumText }
      : undefined
  return useQuery({
    ...lyricQueryOptions(provider, connection?.id, trackId, meta, sourceRevision, sourceIdentity),
    // The player can temporarily point at a track before its title/artist arrives.
    // Wait so this query is not cached as a metadata-less null result.
    enabled: Boolean(provider && trackId && meta?.title),
  })
}

/**
 * 歌词偏移：调整、防抖写回服务端、换歌时用服务端保存的值作初值。
 *
 * 歌词页的调整面板与时间轴共用这一份偏移状态。
 */
export function useLyricOffset(trackId: string) {
  const { provider } = useServerSession()
  const { data: sheet } = useLyricSheet(trackId)
  const sourceRevision = useExternalSourcesStore((state) => state.revision)
  const services = useExternalSourcesStore((state) => state.services)
  const sourceIdentity = externalSourceCacheIdentity(services)
  const offsetMs = usePlayerStore((state) => state.lyricOffsetTrackId === trackId ? state.lyricOffsetMs : 0)
  const setLyricOffsetMs = usePlayerStore((state) => state.setLyricOffsetMs)

  const lyricId = sheet?.id
  const canWriteback = Boolean(provider?.setLyricOffset && provider.capabilities.lyricOffsetWriteback && lyricId)

  // 换歌后用服务端保存的偏移作为初值（store 里的偏移是全局单值）
  const seeded = useRef<{ trackId: string; sourceRevision: number; sourceIdentity: string; hasSheet: boolean; lyricId?: string } | null>(null)
  useEffect(() => {
    if (seeded.current?.trackId !== trackId || seeded.current.sourceRevision !== sourceRevision || seeded.current.sourceIdentity !== sourceIdentity) {
      const saved = usePlayerStore.getState()
      const initialOffset = sheet?.offsetMs
        ?? (seeded.current === null && saved.lyricOffsetTrackId === trackId ? saved.lyricOffsetMs : 0)
      seeded.current = { trackId, sourceRevision, sourceIdentity, hasSheet: Boolean(sheet), lyricId: sheet?.id }
      setLyricOffsetMs(initialOffset, trackId)
      return
    }
    if (!sheet) {
      if (seeded.current.hasSheet) {
        seeded.current = { trackId, sourceRevision, sourceIdentity, hasSheet: false }
        setLyricOffsetMs(0, trackId)
      }
      return
    }
    if (seeded.current.hasSheet && seeded.current.lyricId === sheet.id) return
    seeded.current = { trackId, sourceRevision, sourceIdentity, hasSheet: true, lyricId: sheet.id }
    setLyricOffsetMs(sheet.offsetMs, trackId)
  }, [sheet, sourceRevision, sourceIdentity, trackId, setLyricOffsetMs])

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
      const state = usePlayerStore.getState()
      const next = (state.lyricOffsetTrackId === trackId ? state.lyricOffsetMs : 0) + deltaMs
      setLyricOffsetMs(next, trackId)
      if (!canWriteback || !lyricId) return
      pending.current = { trackId, lyricId, offsetMs: next }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, WRITEBACK_DELAY_MS)
    },
    [canWriteback, flush, lyricId, setLyricOffsetMs, trackId],
  )

  return {
    offsetMs,
    adjust,
    /** 有时间轴才有「偏移」的意义 */
    canAdjust: Boolean(sheet?.synced),
  }
}
