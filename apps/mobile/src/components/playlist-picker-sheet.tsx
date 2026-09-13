import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import type { Playlist } from '@qj/core-domain'
import { CoverImage } from '@/components/cover-image'
import { Icon } from '@/components/icon'
import { useToast } from '@/components/toast'
import { useServerSession } from '@/lib/server-session'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

interface PlaylistPickerSheetProps {
  visible: boolean
  trackId: string
  onClose: () => void
}

export function PlaylistPickerSheet({ visible, trackId, onClose }: PlaylistPickerSheetProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const [mounted, setMounted] = useState(visible)
  const animValue = useRef(new Animated.Value(0)).current
  const isClosingRef = useRef(false)
  const { provider, connection } = useServerSession()
  const toast = useToast()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false
      setMounted(true)
      animValue.setValue(0)
      Animated.timing(animValue, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    } else if (mounted && !isClosingRef.current) {
      isClosingRef.current = true
      Animated.timing(animValue, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        isClosingRef.current = false
        setMounted(false)
      })
    }
  }, [visible, mounted, animValue])

  const handleClose = () => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    Animated.timing(animValue, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isClosingRef.current = false
      setMounted(false)
      onClose()
    })
  }

  const { data: playlists, isPending } = useQuery<Playlist[]>({
    queryKey: ['playlists', connection?.id],
    enabled: mounted && Boolean(provider),
    queryFn: async () => {
      const page = await provider!.playlists({ page: 1, size: 200 })
      return page.items
    },
    staleTime: 60_000,
  })

  const handleSelect = async (playlist: Playlist) => {
    try {
      await provider!.addTracksToPlaylist!(playlist.id, [trackId])
      toast(`已添加到「${playlist.name}」`)
      // 刷新该歌单的曲目缓存，下次进入详情页能看到新曲目
      await queryClient.invalidateQueries({ queryKey: ['playlist-tracks', connection?.id, playlist.id] })
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败')
    }
    handleClose()
  }

  if (!mounted) return null

  const backdropAnimatedStyle = {
    opacity: animValue.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
  }
  const sheetAnimatedStyle = {
    transform: [
      {
        translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [380, 0] }),
      },
    ],
  }

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityLabel="关闭"
            accessibilityRole="button"
          />
        </Animated.View>

        <Animated.View style={[styles.sheetContainer, sheetAnimatedStyle]}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>添加到歌单</Text>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="关闭"
            >
              <Icon name="close" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          {isPending ? (
            <View style={styles.loadingBox}>
              <Text style={styles.emptyText}>加载中…</Text>
            </View>
          ) : !playlists || playlists.length === 0 ? (
            <View style={styles.loadingBox}>
              <Text style={styles.emptyText}>还没有歌单</Text>
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => void handleSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`添加到 ${item.name}`}
                >
                  <CoverImage coverId={item.coverId} size={48} borderRadius={radius.sm} />
                  <View style={styles.text}>
                    <Text numberOfLines={1} style={styles.name}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>{item.trackCount ? `${item.trackCount} 首` : '空歌单'}</Text>
                  </View>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

const useStyles = createThemedStyles((colors) => ({
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgOverlay,
  },
  sheetContainer: {
    backgroundColor: colors.bgModal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderEmphasis,
    maxHeight: '70%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSelected,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 14,
    minHeight: 28,
  },
  sheetTitle: {
    ...typography.headline,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgListItem,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: { opacity: 0.7 },
  text: { flex: 1, gap: 2 },
  name: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  separator: { height: 1, marginLeft: 60, backgroundColor: colors.borderSubtle },
}))
