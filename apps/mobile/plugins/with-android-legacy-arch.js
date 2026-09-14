const { withGradleProperties } = require('expo/config-plugins')

/**
 * 关掉 React Native 的新架构（New Architecture），回到旧桥接。
 *
 * ── 为什么必须走 config plugin ──────────────────────────────────────────────
 * **`app.json` 里的 `expo.newArchEnabled` 是被静默忽略的。**
 * 2026-09-14 实测：在 app.json 写 `"newArchEnabled": false` 后跑 prebuild，
 * 生成的 `android/gradle.properties` 里仍然是 `newArchEnabled=true` —— 与
 * `android.usesCleartextTraffic`（见 with-android-cleartext.js）是同一类坑：
 * Expo 不认识这个键，不报错、不警告，配置就是没生效。
 *
 * 所以只能像这里一样直接改 gradle.properties。
 *
 * ── 为什么这个项目要关掉新架构 ─────────────────────────────────────────────
 * `react-native-track-player` 4.1.2（本项目播放链路的唯一实现，且上游最新版就是它）
 * 是**整体**为旧桥接写的，在新架构下启动路径上有**多处**不兼容。实测按顺序撞到：
 *
 *   1. `MusicModule.kt` 里 37 个 `@ReactMethod` 用表达式函数体，Kotlin 推断出的
 *      返回类型是 `Job` 而非 `Unit`，而 RN 0.86 的 TurboModule 解析器要求
 *      「返回类型非 void ⟺ 是同步方法」→ 解析原生模块描述符时抛 ParsingException
 *      （在 React 挂载之前，表现为「点开就闪退、什么都不显示」）；
 *   2. `MusicService.emit()` 走 `HeadlessJsTaskService.getReactNativeHost()`，
 *      而新架构下 `ReactApplication.reactNativeHost` 的 getter 被改成直接抛异常。
 *
 * 这两处已在 `patches/react-native-track-player@4.1.2.patch` 里修掉，但**无法保证
 * 没有第三处、第四处** —— 每修一处都要真机构建才能发现下一处，成本不可控。
 * 旧桥接是 RNTP 的设计目标，一次绕开整类问题。
 *
 * ── 代价与前提 ─────────────────────────────────────────────────────────────
 * · RN 0.86 **仍然支持**旧架构（2026-09-14 实测 `newArchEnabled=false` 构建通过、
 *   安装到 Android 9 模拟器可正常运行），但这是生态的淘汰方向，将来某个 RN 大版本
 *   会移除它。届时需要重新评估 RNTP 的替代方案。
 * · 已装的两个 RNTP 补丁做了**双架构兼容**（`reactHost` 优先、回退 `reactNativeHost`），
 *   所以将来切回新架构时这两个补丁不需要改。
 */

const PROP = 'newArchEnabled'

/** 把 newArchEnabled 置为 false，幂等（已存在则改值，不重复添加） */
function setLegacyArch(properties) {
  const existing = properties.find((item) => item.type === 'property' && item.key === PROP)
  if (existing) {
    existing.value = 'false'
  } else {
    properties.push({ type: 'property', key: PROP, value: 'false' })
  }
  return properties
}

module.exports = function withAndroidLegacyArch(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = setLegacyArch(cfg.modResults)
    return cfg
  })
}

module.exports.setLegacyArch = setLegacyArch
module.exports.ARCH_PROPERTY = PROP
