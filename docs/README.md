# 文档索引

> **数字（版本、模块数、CI job、校验步骤清单等）只写在 [`现状基线.md`](./现状基线.md)，不要在别处复述。**
> 由 `node scripts/check-docs.mjs` 机械校验。

| 文档 | 内容 |
| --- | --- |
| [`现状基线.md`](./现状基线.md) | **唯一事实源**：版本 / 模块数 / CI job / 校验入口清单 / 文档地图。写文档前先看这里 |
| [`build-and-ci.md`](./build-and-ci.md) | 在 GitHub Actions 上出 Android APK / iOS 未签名 IPA、用户自签说明、`community` / `store` 发行版切换、开发校验（守卫 / ESLint / vitest） |
| [`fnos-music-api.md`](./fnos-music-api.md) | 飞牛音乐（fnOS Mediasrv）HTTP API 端点参考 |
| [`fnos-transcode.md`](./fnos-transcode.md) | 飞牛转码 HLS 机制：会话、播放列表、分片命名、已知行为 |
| [`design-tokens.md`](./design-tokens.md) | 设计令牌：颜色、排版、间距 |
| [`licensing.md`](./licensing.md) | 双轨许可（社区版 GPL-3.0 / 商店版商业许可）的推导：为什么不选 AGPL、为什么 App Store 与 GPL 冲突 |
| [`智能推荐与AI-路线图.md`](./智能推荐与AI-路线图.md) | 本地口味画像/漫游引擎、完整度视图与元数据写回、AI 隐形融合的设计与分期路线；含飞牛写回能力探测结论 |

## 阅读建议

- **想自己构建 / 自签安装**：读 `build-and-ci.md` 的第二节
- **要改 UI**：读 `design-tokens.md` 拿颜色 / 排版 / 间距规范
- **要改 provider 或调接口**：读 `fnos-music-api.md`
- **要动播放架构（本地解码 / 换播放器）**：先读 `fnos-transcode.md`，转码链路的约束都在里面
- **要分发 / 上架，或对许可有疑问**：读 `licensing.md`
- **想了解项目整体结构**：回到仓库根目录的 [`README.md`](../README.md)

## 设计说明

- [轻简音乐 · 播放器横屏沉浸体验设计说明](./design/player-landscape/设计说明.md)
- [漫游卡片探索 · 07](./design/roaming-exploration-07/README.md)
- [漫游卡片探索 · 07](./design/roaming-exploration-07/设计说明.md)

## 审计与修复记录

- [下拉刷新触感与漫游诊断](./下拉刷新触感与漫游诊断-2026-09-30.md)
- [轻简音乐：修复后复审与剩余问题台账](./修复后复审与剩余问题-2026-09-29.md)
- [轻简音乐修复计划与执行记录](./修复计划-弱网与极端场景-2026-09-29.md)
- [轻简音乐 App：全面功能与资源审计台账](./全面功能与资源审计-2026-09-29.md)
- [轻简音乐：弱网与极端场景审计](./审计-弱网与极端场景-2026-09-29.md)
- [导航栏审计与漫游卡片精修 · 2026-10-01](./导航栏审计与首页精修-2026-10-01.md)
- [弱网加载中切歌：补修与复验](./弱网切歌补修-2026-09-29.md)
- [轻简音乐：本轮修复与验收记录](./本轮修复与验收记录-2026-09-29.md)
- [歌词刷新、预取与加载反馈](./歌词刷新预取与加载反馈-2026-09-30.md)
- [歌词动画优化与验证（2026-09-29）](./歌词动画优化-2026-09-29.md)
- [漫游启动排查](./漫游启动排查-2026-09-30.md)
- [网络恢复与蜂窝播放（2026-09-29）](./网络恢复与蜂窝播放-2026-09-29.md)
- [网络设置、存储图表与服务器多线路](./网络设置-存储图表-多线路-2026-09-30.md)

## TestFlight 交付记录

- [TestFlight 0.1.4（43）发布记录](./TestFlight-0.1.4-43-2026-09-29.md)
- [TestFlight 0.1.4（44）发布记录](./TestFlight-0.1.4-44-2026-09-29.md)
- [TestFlight 0.1.4（45）发布记录](./TestFlight-0.1.4-45-2026-09-30.md)
- [TestFlight 0.1.4（47）发布记录](./TestFlight-0.1.4-47-2026-09-30.md)
- [TestFlight 0.1.4（48）发布记录](./TestFlight-0.1.4-48-2026-09-30.md)
- [TestFlight 0.1.4（49）发布记录](./TestFlight-0.1.4-49-2026-09-30.md)
- [TestFlight 0.1.4（50）发布记录](./TestFlight-0.1.4-50-2026-09-30.md)
- [TestFlight 0.1.4（52）发布记录](./TestFlight-0.1.4-52-2026-09-30.md)
- [TestFlight 0.1.4（53）发布记录](./TestFlight-0.1.4-53-2026-09-30.md)
- [TestFlight 0.1.4（54）发布记录](./TestFlight-0.1.4-54-2026-09-30.md)
- [TestFlight 0.1.4（55）发布记录](./TestFlight-0.1.4-55-2026-10-01.md)
- [TestFlight 0.1.4（57）发布记录](./TestFlight-0.1.4-57-2026-10-02.md)
- [TestFlight 0.1.4（58）发布记录](./TestFlight-0.1.4-58-2026-10-02.md)
- [TestFlight 0.1.4（59）发布记录](./TestFlight-0.1.4-59-2026-10-02.md)
- [TestFlight 0.1.4（60）发布记录](./TestFlight-0.1.4-60-2026-10-02.md)
- [TestFlight 0.1.4（61）发布记录](./TestFlight-0.1.4-61-2026-10-02.md)
- [TestFlight 0.1.4（62）发布记录](./TestFlight-0.1.4-62-2026-10-02.md)
- [TestFlight 0.1.4（63）发布记录](./TestFlight-0.1.4-63-2026-10-03.md)
- [TestFlight 0.1.4（64）发布记录](./TestFlight-0.1.4-64-2026-10-03.md)
