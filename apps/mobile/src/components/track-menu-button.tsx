import type { StyleProp, ViewStyle } from 'react-native'
import { View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import { Icon, IconButton, iconSize } from '@/components/icon'
import { PlaylistPickerSheet } from '@/components/playlist-picker-sheet'
import { useTrackMenu, type UseTrackMenuOptions } from '@/lib/use-track-menu'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

/**
 * 快捷菜单按钮（一期 B1 的统一出口）。
 *
 * 列表行、播放页 / 队列顶部卡、队列待播行三处都渲染这一个组件，
 * 只是触发器视觉不同（`variant`）与上下文不同（`context`）。
 * 条目定义与动作派发都在 `useTrackMenu` 里，这里只负责「原生菜单 + 歌单选择器 + 触发器」的拼装。
 */
export interface TrackMenuButtonProps extends UseTrackMenuOptions {
  /** 触发器视觉：列表/待播行用 `icon`，播放页控制区用 `iconButton` */
  variant?: 'icon' | 'iconButton'
  /** 触发器图标颜色（未打开时） */
  color?: string
  title?: string
  accessibilityLabel?: string
  triggerStyle?: StyleProp<ViewStyle>
}

export function TrackMenuButton({
  variant = 'icon',
  color,
  title = '歌曲选项',
  accessibilityLabel = '歌曲选项菜单',
  triggerStyle,
  ...menuOptions
}: TrackMenuButtonProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const menu = useTrackMenu(menuOptions)

  const trigger =
    variant === 'iconButton' ? (
      <IconButton
        name="more"
        size={iconSize.lg}
        color={menu.isMenuOpen ? colors.textPrimary : colors.iconMid}
        isActive={menu.isMenuOpen}
        onPress={() => menuOptions.onBeforeOpen?.()}
        accessibilityLabel={accessibilityLabel}
      />
    ) : (
      <View
        style={[styles.iconWrapper, menu.isMenuOpen && styles.iconWrapperActive, triggerStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Icon
          name="more"
          size={iconSize.md}
          color={menu.isMenuOpen ? colors.textPrimary : color ?? colors.textTertiary}
        />
      </View>
    )

  return (
    <>
      <MenuView
        title={title}
        themeVariant={menu.themeVariant}
        shouldOpenOnLongPress={false}
        isAnchoredToRight={true}
        actions={menu.actions}
        onOpenMenu={menu.onOpenMenu}
        onCloseMenu={menu.onCloseMenu}
        onPressAction={menu.onPressAction}
      >
        {trigger}
      </MenuView>
      <PlaylistPickerSheet
        visible={menu.playlistPickerVisible}
        trackId={menuOptions.subject.trackId}
        onClose={menu.closePlaylistPicker}
      />
    </>
  )
}

const useStyles = createThemedStyles((colors) => ({
  iconWrapper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  iconWrapperActive: {
    backgroundColor: colors.bgListItemActive,
  },
}))
