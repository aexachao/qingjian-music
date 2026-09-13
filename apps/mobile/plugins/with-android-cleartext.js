const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins')

/**
 * Android 9（API 28）起默认禁止明文 HTTP，而「连局域网里的飞牛 NAS」是本 App 的核心场景，
 * 家用环境基本都是 http://192.168.x.x:5666 —— 不放开明文，Android 上直接连不上服务器。
 *
 * 注意：**不能**靠 app.json 里的 `android.usesCleartextTraffic` —— Expo 的 config schema
 * 里根本没有这个键（已核对 @expo/config-types 的 ExpoConfig），写了会被静默忽略，
 * 生成的 AndroidManifest 里不会出现该属性。唯一可靠的做法就是这个 config plugin。
 *
 * 安全权衡：这里放开的是**全量**明文，而不是只允许私有网段。
 * 原因是自建服务器可能用自定义域名 + http，收窄到私有网段会让这类用户直接不可用；
 * 明文流量本身仍受「必须用户主动填写服务器地址」约束，不会自动发起。
 */

/** 把 usesCleartextTraffic 写进 <application>，幂等 */
function applyCleartext(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)
  application.$['android:usesCleartextTraffic'] = 'true'
  return manifest
}

module.exports = function withAndroidCleartext(config) {
  return withAndroidManifest(config, (cfg) => {
    applyCleartext(cfg.modResults)
    return cfg
  })
}

module.exports.applyCleartext = applyCleartext
