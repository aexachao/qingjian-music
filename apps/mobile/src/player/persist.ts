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
const TEMP_FILE_NAME = 'player-session.json.tmp'
const SAVE_DEBOUNCE_MS = 500
const PROGRESS_SAVE_MS = 8_000

function snapshotFile(): File {
  return new File(new Directory(Paths.document), FILE_NAME)
}

function snapshotTempFile(): File {
  return new File(new Directory(Paths.document), TEMP_FILE_NAME)
}

/** Read the newest valid snapshot; invalid legacy data is never restored. */
export function readPlaybackSnapshot(): RestorablePlaybackSnapshot | null {
  // A complete temp is a recoverable commit, including a logout tombstone.
  // Ignore interrupted/invalid temp writes and retain the last valid live file.
  for (const file of [snapshotTempFile(), snapshotFile()]) {
    if (!file.exists) continue
    try {
      const value: unknown = JSON.parse(file.textSync())
      if (value === null) return null
      const snapshot = parsePlaybackSnapshot(value)
      if (snapshot) return snapshot
    } catch {
      // Try the last committed file without deleting recovery evidence.
    }
  }
  return null
}

async function persistSnapshot(snapshot: ReturnType<typeof createPlaybackSnapshot> | null): Promise<void> {
  const file = snapshotFile()
  const temp = snapshotTempFile()
  if (!snapshot) {
    temp.create({ intermediates: true, overwrite: true })
    temp.write('null')
    if (file.exists) file.delete()
    return
  }
  if (temp.exists) temp.delete()
  temp.create({ intermediates: true, overwrite: true })
  temp.write(JSON.stringify(snapshot))
  // Only replace the live file after the complete JSON has reached disk.
  if (file.exists) file.delete()
  temp.move(file)
}

const snapshotWrites = new LatestWriteQueue(persistSnapshot)
let snapshotGeneration = 0

/** 清空与退出时排队删除，避免正在写盘的旧快照在删除后重新出现。 */
export function clearPlaybackSnapshot(): Promise<void> {
  snapshotGeneration += 1
  return snapshotWrites.enqueue(null)
}

/** 写一份当前状态。失败只记日志：持久化是锦上添花，不该打断播放 */
export async function writePlaybackSnapshot(): Promise<void> {
  const generation = snapshotGeneration
  try {
    const { queue, history, baseQueue, index, playMode, autoplay, source, lyricOffsetMs, lyricOffsetTrackId } = usePlayerStore.getState()
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
    if (generation !== snapshotGeneration || usePlayerStore.getState().queue !== queue) return
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
      lyricOffsetMs: lyricOffsetTrackId === queue[index]?.trackId ? lyricOffsetMs : 0,
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
  // Validate recovery data on bridge mount; malformed snapshots are ignored.
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
