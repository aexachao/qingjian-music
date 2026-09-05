import { useServerSession } from '@/lib/server-session'
import { TrackListScreen } from './track-list-screen'

const PAGE_SIZE = 50

/** 最近添加的歌曲：按入库时间倒序，首页「最近添加歌曲」的完整列表 */
export function RecentTracksScreen() {
  const { provider, connection } = useServerSession()

  return (
    <TrackListScreen
      queryKey={['recent-tracks', connection?.id]}
      enabled={Boolean(provider)}
      fetchPage={(page) => provider!.tracks({ page, size: PAGE_SIZE, sort: { field: 'createdAt', order: 'desc' } })}
      source={{ kind: 'tracks', label: '最近添加' }}
      emptyText="音乐库里还没有歌曲"
    />
  )
}
