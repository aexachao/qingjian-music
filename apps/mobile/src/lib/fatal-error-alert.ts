import { Alert } from 'react-native'
import { subscribeFatalError, trimStack } from './fatal-error-capture'

let installed = false

/**
 * 用**原生弹窗**展示致命错误 —— 不依赖 React 挂载。
 *
 * ── 为什么错误屏之外还要这个 ────────────────────────────────────────────────
 * `FatalErrorScreen` 是 React 组件，它要能显示出来，前提是 React 成功挂载并渲染。
 * 但如果异常发生在 `expo-router/entry` 求值阶段（比如某个模块初始化抛错），
 * 入口模块直接失败了 —— **根本不会有任何组件挂载**，错误屏永远没机会渲染。
 *
 * 全局处理器这时其实**捕获到了**错误，只是没有东西能把它显示出来，表现就是
 * 「装得上、点开就闪退、什么都不显示」，和原生崩溃一模一样，无法区分。
 *
 * `Alert.alert` 走的是 RN 的原生模块（Android 的 AlertManager），在 bundle 求值
 * 之前就已就绪，所以它能在 React 挂载失败时依然弹出来。
 *
 * ── 诊断价值 ────────────────────────────────────────────────────────────────
 * 弹出原生错误框 = JS 层问题（答案就在框里）；
 * 仍然什么都没有 = 原生层崩溃（JS 完全没跑起来，得换手段抓日志）。
 */
export function installFatalErrorAlert(): void {
  if (installed) return
  installed = true
  subscribeFatalError((info) => {
    if (!info) return
    // 弹窗正文不能太长，否则 Android 上会被截断；完整堆栈仍在 React 错误屏里
    const body = [info.message, '', ...trimStack(info.stack, 5)].join('\n')
    try {
      Alert.alert(
        '启动失败（诊断）',
        body,
        [{ text: '好' }],
        { cancelable: false },
      )
    } catch {
      // 连 Alert 都不可用（极早期崩溃）时无处可显示，静默即可 —— 不要在这里再抛
    }
  })
}
