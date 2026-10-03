# TestFlight 0.1.4（64）发布记录

> 时点快照：记录当时的实现与验收情况，当前状态以代码和现状基线为准。

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 源码提交：`c4db157`；构建提交：`c1f049a`，均已推送 `origin/master`。
- Build ID：`0bac5803-d3ca-4221-bd96-d363083af2ab`（Build 64）。
- 公开测试组：`313b01b0-e61d-4576-9dae-b6216247dca4`。
- [公开测试链接](https://testflight.apple.com/join/tetMDTQY)。
- Apple 处理状态：`VALID`；Beta 审核状态：`APPROVED`；外部测试状态：`IN_BETA_TESTING`。
- 已加入公开测试组；App Store Connect 返回 `autoNotifyEnabled=true`。

## 本版内容

- 优化歌词沉浸显示、滚动跟随和歌词加载重试体验。
- 统一横竖屏播放器切换动画与歌词对齐，调整播放列表状态角标。
- 修复暂停恢复、音频缓存与下一首预加载链路，减少重复加载和切歌等待。
- 本轮歌手详情页仅进行了审计，没有修改其界面或播放行为。

## 校验

- `node scripts/verify.mjs` 的 11 项检查通过，涵盖架构、文档、ESLint、四个包的 TypeScript 与测试。
- 共 119 个测试文件、1211 项测试通过：core-domain 51、provider-api 21、provider-fnos 112、mobile 1027。
- ESLint 0 错误、122 条警告；SwiftLint 13 个文件、0 违规。
- 原生队列资源选择与音频结束通知回归脚本通过。
- iOS Release 归档、IPA 导出通过；核验版本 0.1.4（64）、store edition、App Store 分发签名与加密声明。
- IPA SHA256：`a731ad0bfe1032299e7c5af9e1d76a3131de504c829c18f895752d4dd81b7d60`。
- JS Bundle SHA256：`df4d84a74353f5bc703926776d36470c1c4a99365433a05687cf496557312da9`。
- 本地构建与签名校验记录：`.cache/testflight-20261003-64/`；安装包：`apps/mobile/.asc/artifacts/export-64/app.ipa`。
