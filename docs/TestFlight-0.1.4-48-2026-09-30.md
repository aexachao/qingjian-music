# TestFlight 0.1.4（48）发布记录

> 时点快照：记录当时的实现与验收情况，当前状态以代码和现状基线为准。

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 公开组已关联本构建，外部测试状态为 `IN_BETA_TESTING`。
- 构建 ID：`b98b5d52-1dad-48e0-a7b9-605d5ec1e2f1`。

## 修复

- 关闭“仅 Wi-Fi 联网”时，首次漫游不再等待网络接口类型判定；实际请求失败由传输层报告，避免将尚未识别或虚拟接口误报为播放禁止。
- 开启“仅 Wi-Fi 联网”时仍要求识别 Wi-Fi，并继续限制蜂窝在线播放。iOS 的 ExpoNetwork 补丁将 Wi-Fi、有线和蜂窝接口排在虚拟接口之前，避免同一网络路径带有虚拟接口时优先得到 `UNKNOWN`。
- 新开关使用独立的持久化键。旧版“蜂窝网络播放”默认关闭所留下的记录不会使“仅 Wi-Fi 联网”在升级后意外开启；新开关的用户选择会继续保存。

## 校验

- 全量单元测试 1,064 项通过，四个包的类型检查、架构守卫、文档事实守卫及本次改动的 ESLint 检查通过。
- `pnpm install --frozen-lockfile` 成功，并确认打补丁后的 iOS 原生源文件进入依赖目录；iOS Release 归档与 IPA 导出成功。
- 645 个源码及配置文件在归档前后保持一致；已核对商店版标记、构建号、包标识和 App Store 分发描述文件。
- IPA SHA-256：`09122fcbf6b27f66c2050a9da633e3cc116f16ac2a49e14e76145fd3fb95e412`
- JS bundle SHA-256：`5b6cb875c7c711a876083741ccea2f29fd82971339163236a3a7a4fd765731c9`
- 构建和 App Store Connect 状态记录：`.cache/testflight-20260930-48/`
- 真机复测重点：升级后确认“仅 Wi-Fi 联网”默认关闭；冷启动直接点击漫游；开启 Wi-Fi 限制后分别在 Wi-Fi、蜂窝和 VPN 环境尝试在线播放。
