/**
 * 真机签名配置插件。
 *
 * ios/ 是 `expo prebuild` 生成的，而且已经进了 .gitignore，
 * 所以在 Xcode 里手点的 Team 每次 prebuild 都会丢。签名信息放在这里，
 * prebuild 之后就直接能编真机，不用再点一遍。
 *
 * 团队 ID 优先读环境变量 QJ_IOS_TEAM_ID（换账号 / CI 上覆盖用），
 * 其次用 app.json 里传进来的 teamId。两个都没有就什么都不做，
 * 这样别人克隆仓库时不会被写死的团队 ID 卡住。
 */
const { withXcodeProject } = require('expo/config-plugins')

module.exports = function withIosSigning(config, options = {}) {
  return withXcodeProject(config, (cfg) => {
    const teamId = process.env.QJ_IOS_TEAM_ID || options.teamId
    if (!teamId) return cfg

    const configurations = cfg.modResults.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key]
      const settings = entry && typeof entry === 'object' ? entry.buildSettings : undefined
      // 只改 app target：用 bundle id 认出来，别碰 Pods 和测试 target
      if (!settings || !settings.PRODUCT_BUNDLE_IDENTIFIER) continue
      settings.DEVELOPMENT_TEAM = teamId
      settings.CODE_SIGN_STYLE = 'Automatic'
      // 故意不动 CODE_SIGN_IDENTITY：模板里的键名是带方括号的
      // "CODE_SIGN_IDENTITY[sdk=iphoneos*]"，写回时容易漏引号把 pbxproj 写坏，
      // 而自动签名本来就会自己挑证书
    }
    return cfg
  })
}
