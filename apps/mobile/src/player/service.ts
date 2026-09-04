import TrackPlayer, { Event } from 'react-native-track-player'

/**
 * 播放服务：处理锁屏 / 控制中心 / 耳机线控 / 车机发来的远程指令。
 * 这里只做「转发给播放器」，业务逻辑放 controller，方便 CarPlay 复用。
 */
export async function playbackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    void TrackPlayer.play()
  })
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    void TrackPlayer.pause()
  })
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    void TrackPlayer.stop()
  })
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    void TrackPlayer.skipToNext()
  })
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    void TrackPlayer.skipToPrevious()
  })
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    void TrackPlayer.seekTo(position)
  })
  TrackPlayer.addEventListener(Event.RemoteJumpForward, ({ interval }) => {
    void TrackPlayer.seekBy(interval)
  })
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, ({ interval }) => {
    void TrackPlayer.seekBy(-interval)
  })
  // 被电话 / 其他 App 打断：永久打断就暂停，短暂打断结束后继续
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent }) => {
    if (permanent) {
      await TrackPlayer.pause()
      return
    }
    if (paused) await TrackPlayer.pause()
    else await TrackPlayer.play()
  })
}
