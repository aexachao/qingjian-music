import { useCallback, useMemo, useState } from 'react'
import { Platform, Share } from 'react-native'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import type { LyricSheet, Track } from '@qj/core-domain'
import { useToast } from '@/components/toast'
import { useDetailHref } from '@/lib/detail-href'
import { useToggleFavorite } from '@/lib/favorites'
import {
  formatOffset,
  loadLyricSheet,
  lyricQueryKey,
  LYRIC_STALE_MS,
  OFFSET_STEP_MS,
  useLyricOffset,
} from '@/lib/lyric-offset'
import { useServerSession } from '@/lib/server-session'
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
import { appendTracks, moveInQueue, playNext, removeFromQueue } from '@/player/controller'
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
  /** 列表上下文必需：playNext / appendTracks 需要完整曲目 */
  track?: Track
  /** 待播上下文必需：该行在队列里的下标 */
  queueIndex?: number
  /** 待播上下文必需：待播行总数 */
  upcomingCount?: number
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
  const toggleFavorite = useToggleFavorite()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [playlistPickerVisible, setPlaylistPickerVisible] = useState(false)

  // 只有「当前曲目」上下文才需要歌词：其它上下文传空串让查询保持 disabled，
  // 否则列表里每个「···」都会去拉一次歌词。
  const lyricTrackId = context === 'current' ? subject.trackId : ''
  const { offsetMs, adjust, canAdjust } = useLyricOffset(lyricTrackId)

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
          canAdjustLyricOffset: canAdjust,
        },
        ...(subject.queueIndex === undefined ? {} : { position: subject.queueIndex }),
        ...(subject.upcomingCount === undefined ? {} : { upcomingCount: subject.upcomingCount }),
      }),
    [
      canAdjust,
      context,
      provider,
      subject.albumId,
      subject.artistId,
      subject.isFavorite,
      subject.queueIndex,
      subject.upcomingCount,
    ],
  )

  const actions = useMemo<MenuAction[]>(() => {
    const leaf = (id: TrackMenuId): MenuAction => {
      const icon = trackMenuIcon(id, { isFavorite: subject.isFavorite })
      return {
        id,
        title: trackMenuLabel(id, { isFavorite: subject.isFavorite }),
        image: Platform.OS === 'ios' ? icon.ios : icon.android,
        imageColor: colors.iconBright,
        ...(TRACK_MENU_DESTRUCTIVE.has(id) ? { attributes: { destructive: true } } : {}),
      }
    }

    // 歌词偏移是个组：原生菜单做不了连续滑块，用 ±0.5 秒步进 + 重置
    const group = (id: string, subIds: TrackMenuId[]): MenuAction => {
      if (id === 'lyric-offset') {
        return {
          id,
          title: `歌词偏移 ${formatOffset(offsetMs)}`,
          subactions: [
            {
              id: 'lyric-earlier',
              title: `提前 ${OFFSET_STEP_MS / 1000} 秒`,
              image: 'goforward',
              imageColor: colors.iconBright,
            },
            {
              id: 'lyric-later',
              title: `延后 ${OFFSET_STEP_MS / 1000} 秒`,
              image: 'gobackward',
              imageColor: colors.iconBright,
            },
            {
              id: 'lyric-reset',
              title: '重置为 0 秒',
              image: 'arrow.counterclockwise',
              imageColor: colors.iconBright,
            },
          ],
        }
      }
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
  }, [colors.iconBright, context, ids, offsetMs, popDirection, subject.isFavorite])

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
      setIsMenuOpen(false)
      setGlobalMenuOpen(false)
      onMenuOpenChange?.(false)

      switch (nativeEvent.event) {
        case 'play-next':
          if (context === 'upcoming') {
            if (subject.queueIndex !== undefined) void moveInQueue(subject.queueIndex, nextPlayTargetIndex())
          } else if (provider && connection && subject.track) {
            void playNext({ provider, serverId: connection.id, tracks: [subject.track] })
            toast('已插入到下一首')
          }
          break

        case 'add-to-queue':
          if (provider && connection && subject.track) {
            void appendTracks({ provider, serverId: connection.id, tracks: [subject.track] })
            toast('已加入队列')
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
            .then(() => toast(subject.isFavorite ? '已取消喜欢' : '已加入我喜欢'))
            .catch(() => toast('操作失败，请稍后再试'))
          break

        case 'remove-from-queue':
          if (subject.queueIndex !== undefined) void removeFromQueue(subject.queueIndex)
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
              sheet = await queryClient.fetchQuery({
                queryKey: lyricQueryKey(connection?.id, subject.trackId),
                queryFn: () => loadLyricSheet(provider, connection?.id, subject.trackId),
                staleTime: LYRIC_STALE_MS,
              })
            } catch {
              // 取歌词失败按「没有歌词」处理，下面会给提示
            }
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

        case 'lyric-earlier':
          adjust(OFFSET_STEP_MS)
          break
        case 'lyric-later':
          adjust(-OFFSET_STEP_MS)
          break
        case 'lyric-reset':
          adjust(-offsetMs)
          break
      }
    },
    [
      adjust,
      connection,
      context,
      href,
      navigate,
      offsetMs,
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
