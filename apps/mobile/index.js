/**
 * 自定义入口：react-native-track-player 的播放服务必须在应用挂载前注册，
 * 所以不能直接用 expo-router/entry 当 main。
 */
import { LogBox } from 'react-native'
import TrackPlayer from 'react-native-track-player'

import { playbackService } from './src/player/service'

TrackPlayer.registerPlaybackService(() => playbackService)

if (__DEV__) {
  // RNTP 的睡眠定时器在 iOS 原生端没有实现，启动必然打 4 条无害警告，
  // 屏蔽掉，避免开发时 LogBox 悬浮条挡住底部 Tab 栏。
  LogBox.ignoreLogs([
    /method signature for the JS method `(setSleepTimer|clearSleepTimer|getSleepTimerProgress|sleepWhenActiveTrackReachesEnd)`/,
  ])
}

// eslint-disable-next-line import/no-unresolved
import 'expo-router/entry'
