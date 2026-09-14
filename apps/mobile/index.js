/**
 * 自定义入口：react-native-track-player 的播放服务必须在应用挂载前注册，
 * 所以不能直接用 expo-router/entry 当 main。
 */
import { installGlobalErrorHandler } from './src/lib/fatal-error-capture'

// 必须最先执行：模块初始化阶段抛的错发生在 React 挂载之前，那时还没有任何组件，
// Error Boundary 无从谈起。装晚了就只能看到一个什么都不留下的闪退。
installGlobalErrorHandler()

// eslint-disable-next-line import/first -- 必须排在 installGlobalErrorHandler() 之后才能生效
import TrackPlayer from 'react-native-track-player'
// eslint-disable-next-line import/first -- 同上，这些 import 的位置是刻意的
import { playbackService } from './src/player/service'

TrackPlayer.registerPlaybackService(() => playbackService)

// 这里必须是「副作用 import」，且必须排在 registerPlaybackService 之后：
// 入口模块一旦被求值就会挂载 expo-router，播放服务必须先注册好。
// eslint-disable-next-line import/first -- 顺序是刻意的，不是写错位置
import 'expo-router/entry'
