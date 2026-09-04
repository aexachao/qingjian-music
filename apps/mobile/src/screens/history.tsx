import { EmptyState } from '@/components/list-states'
import { useServerSession } from '@/lib/server-session'
import { TrackListScreen } from './track-list-screen'

export function HistoryScreen() {
  const { provider, connection } = useServerSession()
  if (provider && !provider.capabilities.playHistory) return <EmptyState text="当前服务器不支持播放历史" />
  return (
    <TrackListScreen
      queryKey={['history', connection?.id]}
      enabled={Boolean(provider?.history)}
      fetchPage={(page) => provider!.history!({ page, size: 50 })}
      source={{ kind: 'history', label: '最近播放' }}
      emptyText="还没有播放记录"
    />
  )
}
