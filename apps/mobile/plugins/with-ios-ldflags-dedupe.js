/**
 * 去掉 app target OTHER_LDFLAGS 里与 Pods 聚合 xcconfig 重复的 -lc++。
 *
 * Expo 模板生成的 pbxproj 给 app target 塞了 -lc++，而 CocoaPods 聚合出来的
 * Pods-app.xcconfig（各 podspec 汇总）里也有一份 -l"c++"。两份经 $(inherited)
 * 拼到同一条链接命令上，Xcode 15+ 的新链接器就会告警：
 *   ld: warning: ignoring duplicate libraries: '-lc++'
 * libc++ 仍然会链上（Pods 那份还在传），这里删的只是 pbxproj 这份重复。
 */
const { withXcodeProject } = require('expo/config-plugins')

module.exports = function withIosLdflagsDedupe(config) {
  return withXcodeProject(config, (cfg) => {
    const configurations = cfg.modResults.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key]
      const settings = entry && typeof entry === 'object' ? entry.buildSettings : undefined
      // 只改 app target：用 bundle id 认出来，别碰 Pods 和测试 target
      if (!settings || !settings.PRODUCT_BUNDLE_IDENTIFIER) continue
      if (!Array.isArray(settings.OTHER_LDFLAGS)) continue
      // pbxproj 解析出来的值自带引号（"\"-lc++\""），比较前先剥掉
      settings.OTHER_LDFLAGS = settings.OTHER_LDFLAGS.filter(
        (flag) => flag.replace(/^"|"$/g, '') !== '-lc++',
      )
      settings.OTHER_LDFLAGS = settings.OTHER_LDFLAGS.filter((flag) => flag !== '-lc++')
    }
    return cfg
  })
}
