import { useMemo, useState } from 'react'
import { Platform, Share, StyleSheet, View } from 'react-native'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import { useRouter } from 'expo-router'
import type { Track } from '@qj/core-domain'
import { Icon, iconSize } from '@/components/icon'
import { useToast } from '@/components/toast'
import { useDetailHref } from '@/lib/detail-href'
import { setGlobalMenuOpen } from '@/lib/menu-guard'
import { colors } from '@/theme/tokens'

interface TrackMoreButtonProps {
  track: Track
  onMenuOpenChange?: (open: boolean) => void
}

/**
 * 歌曲快捷菜单按键（「···」+ 系统原生弹窗）：
 * - 对齐播放页 DeckMoreButton 的交互规范与视觉风格；
 * - 纯 View 承载 MenuView，彻底消除内层 Pressable 事件捕获与外层冒泡冲突；
 * - 全局联动 setGlobalMenuOpen，关闭时不泄露穿透点击至任何底层组件。
 */
export function TrackMoreButton({ track, onMenuOpenChange }: TrackMoreButtonProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const toast = useToast()
  const router = useRouter()
  const href = useDetailHref()

  const artistText = track.artists.map((a) => a.name).join(' / ') || '未知艺术家'

  const actions = useMemo<MenuAction[]>(() => {
    if (Platform.OS === 'ios') {
      return [
        {
          id: 'group-playlist',
          title: '',
          displayInline: true,
          subactions: [
            {
              id: 'add-to-playlist',
              title: '添加到歌单',
              image: 'plus.circle',
              imageColor: '#ffffff',
            },
          ],
        },
        {
          id: 'group-share',
          title: '',
          displayInline: true,
          subactions: [
            {
              id: 'share-song',
              title: '分享歌曲',
              image: 'square.and.arrow.up',
              imageColor: '#ffffff',
            },
          ],
        },
        {
          id: 'group-details',
          title: '',
          displayInline: true,
          subactions: [
            {
              id: 'song-info',
              title: '歌曲信息',
              image: 'info.circle',
              imageColor: '#ffffff',
            },
            ...(track.album?.id
              ? [
                  {
                    id: 'goto-album',
                    title: '前往专辑',
                    image: 'music.note.list',
                    imageColor: '#ffffff',
                  },
                ]
              : []),
            ...(track.artists[0]?.id
              ? [
                  {
                    id: 'goto-artist',
                    title: '查看艺术家',
                    image: 'person.crop.circle',
                    imageColor: '#ffffff',
                  },
                ]
              : []),
          ],
        },
      ]
    }

    return [
      { id: 'add-to-playlist', title: '添加到歌单', image: 'ic_menu_add', imageColor: '#ffffff' },
      { id: 'share-song', title: '分享歌曲', image: 'ic_menu_share', imageColor: '#ffffff' },
      { id: 'song-info', title: '歌曲信息', image: 'ic_menu_help', imageColor: '#ffffff' },
      ...(track.album?.id ? [{ id: 'goto-album', title: '前往专辑', image: 'ic_media_play', imageColor: '#ffffff' }] : []),
      ...(track.artists[0]?.id ? [{ id: 'goto-artist', title: '查看艺术家', image: 'ic_menu_myplaces', imageColor: '#ffffff' }] : []),
    ]
  }, [track])

  const handleAction = ({ nativeEvent }: NativeActionEvent) => {
    setIsMenuOpen(false)
    setGlobalMenuOpen(false)
    onMenuOpenChange?.(false)
    switch (nativeEvent.event) {
      case 'add-to-playlist':
        toast('已添加到歌单')
        break
      case 'share-song':
        void Share.share({
          title: track.title,
          message: `正在听 ${track.title} - ${artistText}`,
        })
        break
      case 'song-info': {
        const durationSec = Math.round((track.durationMs ?? 0) / 1000)
        const m = Math.floor(durationSec / 60)
        const s = durationSec % 60
        const durationStr = `${m}:${String(s).padStart(2, '0')}`
        const meta = [track.title, artistText, track.album?.name].filter(Boolean).join(' · ')
        toast(`${meta} (${durationStr})`)
        break
      }
      case 'goto-album':
        if (track.album?.id) {
          router.push(href.album(track.album.id))
        }
        break
      case 'goto-artist':
        if (track.artists[0]?.id) {
          router.push(href.artist(track.artists[0].id))
        }
        break
    }
  }

  return (
    <MenuView
      title="歌曲选项"
      themeVariant="dark"
      shouldOpenOnLongPress={false}
      isAnchoredToRight={true}
      actions={actions}
      onOpenMenu={() => {
        setIsMenuOpen(true)
        setGlobalMenuOpen(true)
        onMenuOpenChange?.(true)
      }}
      onCloseMenu={() => {
        setIsMenuOpen(false)
        setGlobalMenuOpen(false)
        onMenuOpenChange?.(false)
      }}
      onPressAction={handleAction}
    >
      <View
        style={[styles.buttonWrapper, isMenuOpen && styles.buttonWrapperActive]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="歌曲选项菜单"
      >
        <Icon
          name="more"
          size={iconSize.md}
          color={isMenuOpen ? colors.textPrimary : colors.textTertiary}
        />
      </View>
    </MenuView>
  )
}

const styles = StyleSheet.create({
  buttonWrapper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  buttonWrapperActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
})
