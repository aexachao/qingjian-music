import { AppState } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'
import TrackPlayer from 'react-native-track-player'
import { usePlayerStore } from './store'
import { createPlaybackSnapshot, parsePlaybackSnapshot, type RestorablePlaybackSnapshot } from './snapshot'
import { LatestWriteQueue } from '@/lib/latest-write-queue'

/**
 * 播放会话持久化。
 *
 * 需求：退出去再进 App，迷你播放器要在、播放列表要记住、播放模式要记住、
 * 当前歌曲的进度要记得（从上次停下的位置继续，不自动起播）。
 *
 * 实现：把队列 + 播放模式 + 进度存成 Documents 下的一个 JSON；
 * 每次切歌 / 改设置防抖写一次，播放中每 8 秒补一次进度，退到后台时再写一次。
 * 启动时 PlayerBridge 发现队列为空就读这份快照重建 RNTP 队列（只加载不播放）。
 */
const FILE_NAME = 'player-session.json'
const SAVE_DEBOUNCE_MS = 500
const PROGRESS_SAVE_MS = 8_000

function snapshotFile(): File {
  return new File(new Directory(Paths.document), FILE_NAME)
}

/** 读快照；文件不存在 / 版本不对 / JSON 坏掉都算没有，并删除不安全的旧文件 */
export function readPlaybackSnapshot(): RestorablePlaybackSnapshot | null {
  const file = snapshotFile()
  if (!file.exists) return null
  try {
    const snapshot = parsePlaybackSnapshot(JSON.parse(file.textSync()))
    if (!snapshot) file.delete()
    return snapshot
  } catch (error) {
    console.warn('播放快照读不了', error)
    try {
      if (file.exists) file.delete()
    } catch {
      // 坏文件删除失败不影响本次按新会话启动
    }
    return null
  }
}

async function persistSnapshot(snapshot: ReturnType<typeof createPlaybackSnapshot> | null): Promise<void> {
  const file = snapshotFile()
  if (file.exists) file.delete()
  if (!snapshot) return
  file.create()
  file.write(JSON.stringify(snapshot))
}

const snapshotWrites = new LatestWriteQueue(persistSnapshot)

/** 清空与退出时排队删除，避免正在写盘的旧快照在删除后重新出现。 */
export function clearPlaybackSnapshot(): Promise<void> {
  return snapshotWrites.enqueue(null)
}

/** 写一份当前状态。失败只记日志：持久化是锦上添花，不该打断播放 */
export async function writePlaybackSnapshot(): Promise<void> {
  try {
    const { queue, history, baseQueue, index, playMode, autoplay, source, lyricOffsetMs } = usePlayerStore.getState()
    if (queue.length === 0 || index < 0) {
      await snapshotWrites.enqueue(null)
      return
    }
    let position = 0
    try {
      const progress = await TrackPlayer.getProgress()
      position = progress.position ?? 0
    } catch {
      // RNTP 还没初始化就读不了进度，先把队列结构存下来
    }
    const snapshot = createPlaybackSnapshot({
      serverId: queue[index]?.serverId ?? '',
      queue,
      history,
      baseQueue: baseQueue.length === queue.length ? baseQueue : queue,
      index,
      position,
      playMode,
      autoplay,
      source,
      lyricOffsetMs,
      savedAt: Date.now(),
    })
    await snapshotWrites.enqueue(snapshot)
  } catch (error) {
    console.warn('播放快照写失败', error)
  }
}

/**
 * 挂在根布局一次：切歌 / 改播放模式防抖存，播放中每 8 秒补一次进度，
 * 退到后台再补一次。返回清理函数。
 */
export function startPlaybackPersistence(): () => void {
  // 根桥接挂载时立即清理含鉴权资源的旧版或损坏快照，即使当前尚未登录。
  readPlaybackSnapshot()
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void writePlaybackSnapshot()
    }, SAVE_DEBOUNCE_MS)
  }

  const unsubscribe = usePlayerStore.subscribe((state, previous) => {
    if (
      state.queue === previous.queue &&
      state.history === previous.history &&
      state.index === previous.index &&
      state.playMode === previous.playMode &&
      state.autoplay === previous.autoplay &&
      state.source === previous.source &&
      state.lyricOffsetMs === previous.lyricOffsetMs
    ) {
      return
    }
    schedule()
  })

  const interval = setInterval(() => {
    void writePlaybackSnapshot()
  }, PROGRESS_SAVE_MS)

  const appState = AppState.addEventListener('change', (status) => {
    if (status === 'background' || status === 'inactive') void writePlaybackSnapshot()
  })

  return () => {
    if (timer !== null) clearTimeout(timer)
    clearInterval(interval)
    appState.remove()
    unsubscribe()
  }
}
