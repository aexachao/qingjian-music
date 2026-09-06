import { AppState } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'
import TrackPlayer from 'react-native-track-player'
import type { PlayMode, PlaySource, QueueItem } from '@qj/core-domain'
import { DEFAULT_PLAY_MODE } from '@qj/core-domain'
import { usePlayerStore } from './store'

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

interface PlaybackSnapshot {
  version: 1
  /** 快照属于哪台服务器；切了服务器就不恢复 */
  serverId: string
  queue: QueueItem[]
  /** 关随机时用来还原顺序的原始快照 */
  baseQueue: QueueItem[]
  index: number
  /** 当前曲目播放到的位置（秒） */
  position: number
  playMode: PlayMode
  autoplay: boolean
  source?: PlaySource
  lyricOffsetMs: number
  savedAt: number
}

function snapshotFile(): File {
  return new File(new Directory(Paths.document), FILE_NAME)
}

/** 读快照；文件不存在 / 版本不对 / JSON 坏掉都算没有 */
export function readPlaybackSnapshot(): Omit<PlaybackSnapshot, 'savedAt' | 'version'> | null {
  const file = snapshotFile()
  if (!file.exists) return null
  try {
    const parsed = JSON.parse(file.textSync()) as PlaybackSnapshot
    if (parsed.version !== 1 || !Array.isArray(parsed.queue) || parsed.queue.length === 0) return null
    return {
      serverId: parsed.serverId,
      queue: parsed.queue,
      baseQueue: parsed.baseQueue,
      index: parsed.index,
      position: parsed.position,
      playMode: { ...DEFAULT_PLAY_MODE, ...parsed.playMode },
      autoplay: Boolean(parsed.autoplay),
      source: parsed.source,
      lyricOffsetMs: parsed.lyricOffsetMs ?? 0,
    }
  } catch (error) {
    console.warn('播放快照读不了', error)
    return null
  }
}

/** 清空队列 / 退出登录时删掉快照，下次进来就是全新状态 */
export function deletePlaybackSnapshot(): void {
  try {
    const file = snapshotFile()
    if (file.exists) file.delete()
  } catch {
    // 删不掉无所谓，下次读的时候队列对不上自然会忽略
  }
}

let saving = false

/** 写一份当前状态。失败只记日志：持久化是锦上添花，不该打断播放 */
export async function writePlaybackSnapshot(): Promise<void> {
  if (saving) return
  saving = true
  try {
    const { queue, baseQueue, index, playMode, autoplay, source, lyricOffsetMs } = usePlayerStore.getState()
    if (queue.length === 0 || index < 0) {
      deletePlaybackSnapshot()
      return
    }
    let position = 0
    try {
      const progress = await TrackPlayer.getProgress()
      position = progress.position ?? 0
    } catch {
      // RNTP 还没初始化就读不了进度，先把队列结构存下来
    }
    const snapshot: PlaybackSnapshot = {
      version: 1,
      serverId: queue[index]?.serverId ?? '',
      queue,
      baseQueue: baseQueue.length === queue.length ? baseQueue : queue,
      index,
      position,
      playMode,
      autoplay,
      source,
      lyricOffsetMs,
      savedAt: Date.now(),
    }
    const file = snapshotFile()
    if (file.exists) file.delete()
    file.create()
    file.write(JSON.stringify(snapshot))
  } catch (error) {
    console.warn('播放快照写失败', error)
  } finally {
    saving = false
  }
}

/**
 * 挂在根布局一次：切歌 / 改播放模式防抖存，播放中每 8 秒补一次进度，
 * 退到后台再补一次。返回清理函数。
 */
export function startPlaybackPersistence(): () => void {
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
