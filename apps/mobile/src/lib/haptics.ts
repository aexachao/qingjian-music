import * as Haptics from 'expo-haptics'

/**
 * 触感反馈统一出口。
 *
 * ── 为什么要收口 ────────────────────────────────────────────────────────────
 * 之前每个调用点各自手写 `Haptics.impactAsync(...)`，结果必然漂移：
 * 迷你播放条的「播放 / 下一首」有反馈，全屏播放页的「上一首 / 播放暂停 / 下一首」
 * 反而没有 —— 同一个语义的控件在两个入口手感不一致，用户会直接觉得「不细」。
 * 这类问题不该靠 review 一个个抓，而是让「加触感」只有一个地方可写。
 *
 * ── 用法约定 ───────────────────────────────────────────────────────────────
 *   tap()    离散按钮点击：播放/暂停、上一首/下一首、列表项、工具栏按钮
 *   select() 连续可调控件在滑动过程中：进度条拖动、音量条
 *
 * 两种都吞掉 Promise：触感是锦上添花，失败（设备不支持、系统设置关闭）
 * 绝不能冒泡成未处理的 rejection，更不能影响主流程。
 */

/** 普通按钮点击 */
export function tap(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
}

/** 连续控件滑动 */
export function select(): void {
  void Haptics.selectionAsync()
}
