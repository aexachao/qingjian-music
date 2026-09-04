/**
 * 自定义入口：react-native-track-player 的播放服务必须在应用挂载前注册，
 * 所以不能直接用 expo-router/entry 当 main。
 */
import TrackPlayer from 'react-native-track-player'

import { playbackService } from './src/player/service'

TrackPlayer.registerPlaybackService(() => playbackService)

// eslint-disable-next-line import/no-unresolved
import 'expo-router/entry'
