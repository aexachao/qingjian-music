import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'
import TrackPlayer, { useIsPlaying, useProgress } from 'react-native-track-player'
import { useServerSession } from '@/lib/server-session'
import { playTrackList } from '@/player/controller'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { colors, spacing, typography } from '@/theme/tokens'

/**
 * 开发期自检页（仅 __DEV__）：打开即自动取第一张专辑的第一首播放，
 * 用来验证「provider 取流 → 鉴权头 → RNTP 播放」这条链路，不需要人工点击。
 * 生产包里这个页面直接返回 null。
 */
export default function DevSmokeScreen() {
  const { provider, connection, status } = useServerSession()
  const [log, setLog] = useState<string[]>([])
  const progress = useProgress(500)
  const { playing } = useIsPlaying()
  const current = usePlayerStore(selectCurrent)

  useEffect(() => {
    if (!__DEV__ || !provider || !connection) return
    let cancelled = false
    const push = (line: string) => {
      if (!cancelled) setLog((prev) => [...prev, line])
      console.log('[自检]', line)
    }
    void (async () => {
      try {
        const albums = await provider.albums({ page: 1, size: 1 })
        const album = albums.items[0]
        if (!album) return push('曲库里没有专辑')
        push(`专辑：${album.name}`)
        const tracks = await provider.albumTracks(album.id, { page: 1, size: 5 })
        push(`曲目：${tracks.items.map((t) => t.title).join(' / ')}`)
        const first = tracks.items[0]
        if (!first) return push('专辑里没有曲目')
        const stream = await provider.stream(first.id, { quality: 'original', allowTranscode: false })
        push(`流地址：${stream.url.slice(0, 60)}… headers=${Object.keys(stream.headers).join(',')}`)
        await playTrackList({
          provider,
          serverId: connection.id,
          tracks: tracks.items,
          startIndex: 0,
          sourceLabel: `自检 · ${album.name}`,
        })
        push('已调用 playTrackList')
        setTimeout(() => {
          void (async () => {
            const state = await TrackPlayer.getPlaybackState()
            const p = await TrackPlayer.getProgress()
            push(`3 秒后：state=${state.state} position=${p.position.toFixed(2)} duration=${p.duration.toFixed(2)}`)
          })()
        }, 3000)
      } catch (error) {
        push(`失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [provider, connection])

  if (!__DEV__) return null

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>播放链路自检</Text>
      <Text style={styles.line}>会话状态：{status}</Text>
      <Text style={styles.line}>服务器：{connection?.displayName ?? '未连接'}</Text>
      <Text style={styles.line}>
        正在播放：{current?.title ?? '无'} / playing={String(playing)} / position={progress.position.toFixed(2)}s /
        duration={progress.duration.toFixed(2)}s
      </Text>
      {log.map((line, index) => (
        <Text key={index} style={styles.line}>
          · {line}
        </Text>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingTop: spacing.xxl * 2 },
  title: { ...typography.title, color: colors.text },
  line: { ...typography.footnote, color: colors.textSecondary },
})
