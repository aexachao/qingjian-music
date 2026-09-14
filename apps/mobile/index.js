/**
 * 自定义入口：react-native-track-player 的播放服务必须在应用挂载前注册，
 * 所以不能直接用 expo-router/entry 当 main。
 */
import { installGlobalErrorHandler } from './src/lib/fatal-error-capture'
import { installFatalErrorAlert } from './src/lib/fatal-error-alert'
import TrackPlayer from 'react-native-track-player'
import { playbackService } from './src/player/service'

// 顺序是刻意的，两步都要在 expo-router/entry 之前：
//   1. 先装全局处理器，才能捕获到模块初始化阶段抛的错（那时还没有任何组件）
//   2. 再订阅原生弹窗，让错误在 React 挂载失败时仍能显示出来
installGlobalErrorHandler()
installFatalErrorAlert()

TrackPlayer.registerPlaybackService(() => playbackService)

// 这里必须是「副作用 import」，且必须排在 registerPlaybackService 之后：
// 入口模块一旦被求值就会挂载 expo-router，播放服务必须先注册好。
// eslint-disable-next-line import/first -- 顺序是刻意的，不是写错位置
import 'expo-router/entry'
