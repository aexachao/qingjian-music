/**
 * 自定义入口：react-native-track-player 的播放服务必须在应用挂载前注册，
 * 所以不能直接用 expo-router/entry 当 main。
 */
import { installGlobalErrorHandler } from './src/lib/fatal-error-capture'
import { installFatalErrorAlert } from './src/lib/fatal-error-alert'
import { installCrashLogPersistence, setCrashLogMeta } from './src/lib/crash-log-store'
import Constants from 'expo-constants'
import TrackPlayer from 'react-native-track-player'
import { playbackService } from './src/player/service'

// 顺序是刻意的，三步都要在 expo-router/entry 之前：
//   1. 先装全局处理器，才能捕获到模块初始化阶段抛的错（那时还没有任何组件）
//   2. 订阅原生弹窗，让错误在 React 挂载失败时仍能显示出来
//   3. 订阅崩溃日志落盘，供测试人员崩溃后在设置里查看/复制/分享
setCrashLogMeta({
  appVersion: Constants.expoConfig?.version,
  buildNumber: Constants.expoConfig?.ios?.buildNumber ?? String(Constants.expoConfig?.android?.versionCode ?? ''),
})
installGlobalErrorHandler()
installFatalErrorAlert()
installCrashLogPersistence()

TrackPlayer.registerPlaybackService(() => playbackService)

// React Native 延迟注册原生视图的事件配置。iOS 在首个视图配置加载前
// 偶尔会发来 topLayout；提前加载 RCTView 可让 onLayout 在挂载前就已注册。
// 这里使用 require 保证执行顺序，静态 import 会被 Metro 提前到模块顶部。
if (require('react-native').Platform.OS === 'ios') {
  require('react-native/Libraries/Components/View/ViewNativeComponent')
  require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry').get('RCTView')
}

// expo-router/entry 会立即挂载应用，必须在错误处理器、播放服务和事件配置就绪后执行。
require('expo-router/entry')
