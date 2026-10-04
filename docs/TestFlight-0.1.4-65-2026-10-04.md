# TestFlight 0.1.4（65）发布记录

> 时点快照：记录 2026-10-04 的实现与验收情况，当前状态以代码和 App Store Connect 为准。

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 源码提交：`7926fa5`，已推送 `origin/master`。
- Build ID：`f22143da-3ff0-45c4-a4dc-ca32e5167ddb`（Build 65）。
- 公开测试组：`313b01b0-e61d-4576-9dae-b6216247dca4`。
- [公开测试链接](https://testflight.apple.com/join/tetMDTQY)。
- Apple 处理状态：`VALID`；Beta 审核状态：`APPROVED`；外部测试状态：`IN_BETA_TESTING`。
- 已加入公开测试组；App Store Connect 返回 `autoNotifyEnabled=true`。

## 本版内容

- 统一普通二、三级页面导航栏图标动作的 44pt 触区、动作间距与按下反馈，保留系统根据背景与主题调整的导航材质；搜索和编辑流程继续使用“取消 / 完成”。
- 歌手详情精简为“歌曲 / 专辑”，结合外部曲库显示完整专辑目录；专辑详情统一入库与未入库信息、头图氛围和菜单动作。
- 修复歌词滚动到底后的边界表现，优化歌词和播放器在横竖屏切换时的布局与过渡。

## 校验

- `pnpm verify` 的 11 项检查通过，涵盖架构、文档、ESLint、四个包的 TypeScript 与测试。
- 共 1,234 项测试通过：core-domain 58、provider-api 21、provider-fnos 112、mobile 1,043。ESLint 0 错误、122 条警告。
- iPhone 17 Pro（iOS 26.5）模拟器 Release 构建与深浅色导航实景通过；外部数据源的添加菜单可正常打开。
- iOS Release 归档、IPA 导出通过；核验版本 0.1.4（65）、store edition、App Store 分发签名与加密声明。
- IPA SHA256：`a52d1e1cd19979c549ddb9856fc38fff68e58df3688192632ff9525f020615fa`。
- JS Bundle SHA256：`a1151632d9cb8845a15d599c38b162a4da6a2b874bea683710df6e8202aeba7b`。
- 本地构建与签名校验记录：`.cache/testflight-20261004-65/`；安装包：`apps/mobile/.asc/artifacts/export-65/app.ipa`。
