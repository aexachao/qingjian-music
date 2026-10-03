import TrackPlayer, { Event } from 'react-native-track-player'
import { pausePlayback, resumePlayback, seekPlayback, skipToNextSafe, skipToPreviousSmart } from './controller'

function handleRemoteCommand(event: string, operation: () => Promise<unknown>): void {
  try {
    void Promise.resolve(operation()).catch((error: unknown) => {
      console.warn(`处理远程控制事件 ${event} 失败`, error)
    })
  } catch (error) {
    console.warn(`处理远程控制事件 ${event} 失败`, error)
  }
}

/**
 * 播放服务：处理锁屏 / 控制中心 / 耳机线控 / 车机发来的远程指令。
 * 这里只做「转发给播放器」，业务逻辑放 controller，方便 CarPlay 复用。
 */
export async function playbackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    handleRemoteCommand(Event.RemotePlay, () => resumePlayback())
  })
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    handleRemoteCommand(Event.RemotePause, () => pausePlayback())
  })
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    handleRemoteCommand(Event.RemoteStop, () => pausePlayback(true))
  })
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    handleRemoteCommand(Event.RemoteNext, () => skipToNextSafe())
  })
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    handleRemoteCommand(Event.RemotePrevious, () => skipToPreviousSmart())
  })
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    handleRemoteCommand(Event.RemoteSeek, () => seekPlayback(position))
  })
  TrackPlayer.addEventListener(Event.RemoteJumpForward, ({ interval }) => {
    handleRemoteCommand(Event.RemoteJumpForward, async () => seekPlayback((await TrackPlayer.getProgress()).position + interval))
  })
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, ({ interval }) => {
    handleRemoteCommand(Event.RemoteJumpBackward, async () => seekPlayback(Math.max(0, (await TrackPlayer.getProgress()).position - interval)))
  })
  // Interruption handling is configured natively in setup.ts. In particular, iOS
  // already resumes when the interruption ends with shouldResume=true; responding
  // to RemoteDuck here can duplicate that play or revive an obsolete playback intent.
}
