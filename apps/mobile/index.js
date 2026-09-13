/**
 * 自定义入口：react-native-track-player 的播放服务必须在应用挂载前注册，
 * 所以不能直接用 expo-router/entry 当 main。
 */
import TrackPlayer from 'react-native-track-player'

import { playbackService } from './src/player/service'

TrackPlayer.registerPlaybackService(() => playbackService)

// 这里必须是「副作用 import」，且必须排在 registerPlaybackService 之后：
// 入口模块一旦被求值就会挂载 expo-router，播放服务必须先注册好。
// eslint-disable-next-line import/first -- 顺序是刻意的，不是写错位置
import 'expo-router/entry'
