import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '@/components/icon'
import { useConfirm } from '@/components/confirm-modal'
import { usePrompt } from '@/components/prompt-modal'
import { useToast } from '@/components/toast'
import { useServerSession } from '@/lib/server-session'
import { useThemeColors } from '@/theme/theme-provider'
import { TrackListScreen } from './track-list-screen'

export function PlaylistDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const { provider, connection } = useServerSession()
  const router = useRouter()
  const prompt = usePrompt()
  const confirm = useConfirm()
  const toast = useToast()
  const queryClient = useQueryClient()
  const colors = useThemeColors()
  const canWrite = provider?.capabilities.playlists === 'write'

  const handleRename = () => {
    prompt({
      title: '重命名歌单',
      placeholder: '歌单名称',
      defaultValue: name || '',
      confirmText: '保存',
      cancelText: '取消',
      maxLength: 32,
      validate: (value) => {
        if (!value.trim()) return '歌单名称不能为空'
        if (value.trim().length > 32) return '名称不能超过 32 个字符'
        return undefined
      },
      onConfirm: async (newName) => {
        try {
          await provider!.editPlaylist!(id, { name: newName })
          toast('已保存')
          await queryClient.invalidateQueries({ queryKey: ['playlists', connection?.id] })
          await queryClient.invalidateQueries({ queryKey: ['playlist-tracks', connection?.id, id] })
        } catch (e) {
          toast(e instanceof Error ? e.message : '保存失败')
        }
      },
    })
  }

  const handleDelete = () => {
    confirm({
      title: '删除歌单',
      message: `确定要删除歌单「${name || '未命名'}」吗？
歌单内的歌曲不会被删除。`,
      confirmText: '删除',
      cancelText: '取消',
      destructive: true,
      onConfirm: async () => {
        try {
          await provider!.deletePlaylist!(id)
          toast('歌单已删除')
          await queryClient.invalidateQueries({ queryKey: ['playlists', connection?.id] })
          router.back()
        } catch (e) {
          toast(e instanceof Error ? e.message : '删除失败')
        }
      },
    })
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: name || '歌单',
          headerRight: canWrite
            ? () => (
                <Pressable
                  hitSlop={12}
                  onPress={() => {
                    // 简单的 action sheet 替代：先 confirm 选择操作
                    confirm({
                      title: name || '歌单',
                      message: '',
                      confirmText: '重命名',
                      cancelText: '删除',
                      destructive: false,
                      onConfirm: handleRename,
                      onCancel: handleDelete,
                    })
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="歌单菜单"
                >
                  <Icon name="more" size={22} color={colors.textPrimary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <TrackListScreen
        queryKey={['playlist-tracks', connection?.id, id]}
        enabled={Boolean(provider && id)}
        fetchPage={(page) => provider!.playlistTracks(id, { page, size: 50 })}
        source={{ kind: 'playlist', id: id, label: name ? `歌单 · ${name}` : '歌单' }}
        emptyText="这个歌单还没有歌曲"
      />
    </>
  )
}
