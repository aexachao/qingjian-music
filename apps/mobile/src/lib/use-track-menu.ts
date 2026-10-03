import { fetchForegroundLyric, lyricQueryOptions } from '@/lib/lyric-loader'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Platform, Share } from 'react-native'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import type { LyricSheet, Track } from '@qj/core-domain'
import { useToast } from '@/components/toast'
import { useDetailHref } from '@/lib/detail-href'
import { useToggleFavorite } from '@/lib/favorites'
import { isFavoriteMutationCancelled } from '@/lib/favorite-mutation'
import { downloadKey } from '@/lib/download-policy'
import { useIsDownloaded, useIsDownloading } from '@/lib/use-downloads'
import { useServerSession } from '@/lib/server-session'
import { recordTasteSignal } from '@/lib/taste-profile-store'
import { downloadTrack, removeDownload } from '@/player/downloads'
import { setGlobalMenuOpen } from '@/lib/menu-guard'
import {
  nextPlayTargetIndex,
  queueEndTargetIndex,
  TRACK_MENU_DESTRUCTIVE,
  TRACK_MENU_GROUP_IDS,
  trackMenuGroups,
  trackMenuIcon,
  trackMenuIds,
  trackMenuLabel,
  type TrackMenuContext,
  type TrackMenuId,
} from '@/lib/track-menu'
import { appendTracks, moveInQueue, playNext, removeFromQueue, removeHistoryItem,
  shouldTranscode,
  toQueueItem,
} from '@/player/controller'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * 快捷菜单的菜单对象（一期 B1 的共享层）。
 *
 * 三处 UI（列表行 / 播放页与队列顶部卡 / 队列待播行）都只用这一个 hook：
 * 「有哪些条目、什么顺序、什么图标文案」全部来自纯模块 `lib/track-menu.ts`，
 * 「点了之后做什么」也在这里统一派发 —— 这样就不可能再出现
 * 「列表那份接了真实现、播放页那份还是假 toast」这种漂移。
 *
 * 调用方只需要：把 `actions` 交给 MenuView、把 `onPressAction` 接上、
 * 再按 `playlistPickerVisible` 渲染一个 `PlaylistPickerSheet`。
 */

export interface TrackMenuSubject {
  trackId: string
  title: string
  artistText: string
  albumId?: string
  albumText?: string
  artistId?: string
  durationMs?: number
  isFavorite?: boolean
  coverId?: string
  /** 列表上下文必需：playNext / appendTracks 需要完整曲目 */
  track?: Track
  /** 待播上下文必需：该行在队列里的下标 */
  queueIndex?: number
  /** 待播上下文必需：待播行总数 */
  upcomingCount?: number
  /** 历史行标识：用于决定是显示「从队列移除」还是「从历史记录移除」 */
  isHistory?: boolean
  /** 历史行专用：QueueItem 的 qid（用于删除历史记录） */
  qid?: string
}

export interface UseTrackMenuOptions {
  context: TrackMenuContext
  subject: TrackMenuSubject
  /** 仅 iOS 有意义：原生菜单向上还是向下弹出（决定分组顺序） */
  popDirection?: 'up' | 'down'
  /** 菜单打开前回调（用于收起左滑删除等），返回值不参与是否打开的判断 */
  onBeforeOpen?: () => void
  onMenuOpenChange?: (open: boolean) => void
  /** 导航前先收起播放页（当前上下文用） */
  onNavigate?: (action: () => void) => void
}

export interface TrackMenuController {
  actions: MenuAction[]
  /** 交给 MenuView 的 themeVariant，保证菜单跟随 App 深浅色 */
  themeVariant: 'light' | 'dark'
  isMenuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onPressAction: (event: NativeActionEvent) => void
  playlistPickerVisible: boolean
  closePlaylistPicker: () => void
}

export function useTrackMenu({
  context,
  subject,
  popDirection = 'up',
  onBeforeOpen,
  onMenuOpenChange,
  onNavigate,
}: UseTrackMenuOptions): TrackMenuController {
  const { colors, mode } = useAppTheme()
  const toast = useToast()
  const router = useRouter()
  const href = useDetailHref()
  const queryClient = useQueryClient()
  const { provider, connection } = useServerSession()
  const sessionRef = useRef({ provider, serverId: connection?.id })
  useLayoutEffect(() => {
    sessionRef.current = { provider, serverId: connection?.id }
    return () => { sessionRef.current = { provider: null, serverId: undefined } }
  }, [provider, connection?.id])
  const toggleFavorite = useToggleFavorite()
  // 下载状态跟着登记表变：下完再打开菜单就该显示「删除下载」
  const downloaded = useIsDownloaded(connection?.id, subject.trackId)
  const downloading = useIsDownloading(connection?.id, subject.trackId)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [playlistPickerVisible, setPlaylistPickerVisible] = useState(false)

  const ids = useMemo(
    () =>
      trackMenuIds({
        context,
        capabilities: {
          canFavorite: Boolean(provider?.capabilities.favorites),
          isFavoriteKnown: subject.isFavorite !== undefined,
          canWritePlaylist: Boolean(provider?.capabilities.playlists === 'write'),
          hasAlbum: Boolean(subject.albumId),
          hasArtist: Boolean(subject.artistId),
          canDownload: Boolean(provider && connection && subject.track),
          isDownloaded: downloaded || downloading,
          // 队列类条目要完整曲目：列表行有，历史行看 QueueItem.track 有没有留下来
          hasTrack: Boolean(subject.track),
        },
        ...(subject.queueIndex === undefined ? {} : { position: subject.queueIndex }),
        ...(subject.upcomingCount === undefined ? {} : { upcomingCount: subject.upcomingCount }),
        ...(subject.isHistory ? { isHistory: true } : {}),
      }),
    [
      context,
      provider,
      subject.albumId,
      subject.artistId,
      subject.isFavorite,
      subject.track,
      subject.queueIndex,
      subject.upcomingCount,
      subject.isHistory,
      // 下载状态与连接：菜单条目按「是否已下载」二选一（第 7 轮）
      connection,
      downloaded,
      downloading,
    ],
  )

  const actions = useMemo<MenuAction[]>(() => {
    const leaf = (id: TrackMenuId): MenuAction => {
      const icon = trackMenuIcon(id, { isFavorite: subject.isFavorite })
      return {
        id,
        title: id === 'remove-download' && downloading ? '取消下载' : trackMenuLabel(id, { isFavorite: subject.isFavorite }),
        image: Platform.OS === 'ios' ? icon.ios : icon.android,
        imageColor: colors.iconBright,
        ...(TRACK_MENU_DESTRUCTIVE.has(id) ? { attributes: { destructive: true } } : {}),
      }
    }

    const group = (id: string, subIds: TrackMenuId[]): MenuAction => {
      return {
        id,
        title: '',
        displayInline: true,
        subactions: subIds.map(leaf),
      }
    }

    // Android 不支持分组，直接平铺（顺序与 iOS 的原始顺序一致）
    if (Platform.OS !== 'ios') {
      return ids.flatMap((id) => {
        if (TRACK_MENU_GROUP_IDS.has(id)) return [group(id, [id])]
        return [leaf(id)]
      })
    }

    return trackMenuGroups(ids, context, popDirection).map((item) => group(item.id, item.ids))
  }, [colors.iconBright, context, downloading, ids, popDirection, subject.isFavorite])

  const navigate = useCallback(
    (action: () => void) => {
      if (context !== 'current') {
        action()
        return
      }
      if (onNavigate) {
        onNavigate(action)
        return
      }
      // 没给「先收起播放页」的回调时，自己退栈并等退场动画走完再跳
      router.back()
      setTimeout(action, 320)
    },
    [context, onNavigate, router],
  )

  const onPressAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      const isCurrentSession = () =>
        sessionRef.current.provider === provider && sessionRef.current.serverId === connection?.id
      const reportCommit = (operation: () => Promise<boolean>, success: string, failure: string) => {
        void Promise.resolve().then(operation).then((committed) => {
          if (!isCurrentSession()) return
          toast(committed ? success : failure)
        }).catch(() => {
          if (isCurrentSession()) toast(failure)
        })
      }
      setIsMenuOpen(false)
      setGlobalMenuOpen(false)
      onMenuOpenChange?.(false)

      switch (nativeEvent.event) {
        case 'play-next':
          if (context === 'upcoming') {
            if (subject.queueIndex !== undefined) void moveInQueue(subject.queueIndex, nextPlayTargetIndex())
          } else if (provider && connection && subject.track) {
            reportCommit(
              () => playNext({ provider, serverId: connection.id, tracks: [subject.track!] }),
              '已插入到下一首',
              '插入失败，请稍后再试',
            )
          }
          break

        case 'add-to-queue':
          if (provider && connection && subject.track) {
            reportCommit(
              () => appendTracks({ provider, serverId: connection.id, tracks: [subject.track!] }),
              '已加入队列',
              '加入队列失败，请稍后再试',
            )
          }
          break

        case 'add-to-playlist':
          setPlaylistPickerVisible(true)
          break

        case 'move-to-end':
          if (subject.queueIndex !== undefined && subject.upcomingCount !== undefined) {
            void moveInQueue(subject.queueIndex, queueEndTargetIndex(subject.upcomingCount))
          }
          break

        case 'toggle-favorite':
          void toggleFavorite(subject.trackId, !subject.isFavorite)
            .then(() => {
              if (sessionRef.current.provider !== provider || sessionRef.current.serverId !== connection?.id) return
              toast(subject.isFavorite ? '已取消喜欢' : '已加入我喜欢')
              // 收藏/取消收藏是强口味信号，喂给本地画像（需完整曲目拿 artists/genres）
              if (connection && subject.track) {
                recordTasteSignal(connection.id, subject.track, subject.isFavorite ? 'unfavorited' : 'favorited')
              }
            })
            .catch((error: unknown) => {
              if (isFavoriteMutationCancelled(error)) return
              if (sessionRef.current.provider !== provider || sessionRef.current.serverId !== connection?.id) return
              toast('操作失败，请稍后再试')
            })
          break

        case 'download':
          if (provider && connection && subject.track) {
            const item = toQueueItem(subject.track, provider, connection.id)
            void downloadTrack({
              provider,
              serverId: connection.id,
              track: subject.track,
              requiresTranscode: shouldTranscode(item),
            })
              .then(() => {
                if (isCurrentSession()) toast('已开始下载')
              })
              .catch((error: unknown) => {
                if (isCurrentSession()) toast(error instanceof Error ? error.message : '下载失败')
              })
          }
          break

        case 'remove-download':
          if (connection) {
            void Promise.resolve().then(() => removeDownload(downloadKey(connection.id, subject.trackId)))
              .then(() => {
                if (isCurrentSession()) toast(downloading ? '已取消下载' : '已删除下载')
              })
              .catch((error: unknown) => {
                if (isCurrentSession()) toast(error instanceof Error ? error.message : '删除下载失败')
              })
          }
          break

        case 'remove-from-queue':
          if (subject.queueIndex !== undefined) void removeFromQueue(subject.queueIndex)
          break

        case 'remove-from-history':
          if (subject.qid) void removeHistoryItem(subject.qid)
          break

        case 'share-song': {
          // 专辑名只在有值时才拼进去：单曲/未知专辑的情况下不该出现一个空的「（）」
          const albumPart = subject.albumText ? ` · ${subject.albumText}` : ''
          void Share.share({
            title: subject.title,
            message: `正在听《${subject.title}》- ${subject.artistText}${albumPart}`,
          })
          break
        }

        case 'share-lyrics': {
          // 分享真实歌词内容；歌词走同一份 React Query 缓存，命中时不会发请求
          void (async () => {
            let sheet: LyricSheet | null = null
            try {
              sheet = await fetchForegroundLyric(queryClient, lyricQueryOptions(provider, connection?.id, subject.trackId, {
                title: subject.title, artist: subject.artistText, album: subject.albumText,
              }))
            } catch {
              // 取歌词失败按「没有歌词」处理，下面会给提示
            }
            if (!isCurrentSession()) return
            const lines = (sheet?.lines ?? []).map((line) => line.text.trim()).filter(Boolean)
            if (lines.length === 0) {
              toast('这首歌还没有歌词')
              return
            }
            // 系统分享有长度限制（微信尤其），截前 40 行并标注总数
            const maxLines = 40
            const body = lines.slice(0, maxLines).join('\n')
            const suffix = lines.length > maxLines ? `\n…（共 ${lines.length} 行）` : ''
            void Share.share({
              title: `${subject.title} 歌词`,
              message: `《${subject.title}》- ${subject.artistText}\n\n${body}${suffix}\n\n(分享自轻简音乐)`,
            })
          })()
          break
        }

        case 'song-info':
          router.push({
            pathname: '/track-info' as never,
            params: {
              trackId: subject.trackId,
              title: subject.title,
              artist: subject.artistText,
              album: subject.albumText || '',
              duration: String(subject.durationMs || ''),
              coverId: subject.coverId || subject.track?.coverId || subject.track?.album?.coverId || '',
              // 带上完整曲目，编辑页靠它拿到当前 artists/genres/year/trackNo/discNo（开启内联编辑）
              trackJson: subject.track ? JSON.stringify(subject.track) : '',
            },
          })
          break

        case 'goto-album':
          if (subject.albumId) {
            const target = href.album(subject.albumId)
            navigate(() => router.push(target))
          } else {
            toast('暂无专辑信息')
          }
          break

        case 'goto-artist':
          if (subject.artistId) {
            const target = href.artist(subject.artistId)
            navigate(() => router.push(target))
          } else {
            toast('暂无艺术家信息')
          }
          break

      }
    },
    [
      connection,
      context,
      downloading,
      href,
      navigate,
      onMenuOpenChange,
      provider,
      queryClient,
      router,
      subject,
      toast,
      toggleFavorite,
    ],
  )

  const onOpenMenu = useCallback(() => {
    setIsMenuOpen(true)
    // 全局标记：列表页靠它挂全屏拦截遮罩，并且关闭后的 450ms 冷却能防「点空白关菜单」误触底层
    setGlobalMenuOpen(true)
    onMenuOpenChange?.(true)
    onBeforeOpen?.()
  }, [onBeforeOpen, onMenuOpenChange])

  const onCloseMenu = useCallback(() => {
    setIsMenuOpen(false)
    setGlobalMenuOpen(false)
    onMenuOpenChange?.(false)
  }, [onMenuOpenChange])

  return {
    actions,
    themeVariant: mode,
    isMenuOpen,
    onOpenMenu,
    onCloseMenu,
    onPressAction,
    playlistPickerVisible,
    closePlaylistPicker: useCallback(() => setPlaylistPickerVisible(false), []),
  }
}
