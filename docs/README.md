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

## 阅读建议

- **想自己构建 / 自签安装**：读 `build-and-ci.md` 的第二节
- **要改 UI**：读 `design-tokens.md` 拿颜色 / 排版 / 间距规范
- **要改 provider 或调接口**：读 `fnos-music-api.md`
- **要动播放架构（本地解码 / 换播放器）**：先读 `fnos-transcode.md`，转码链路的约束都在里面
- **要分发 / 上架，或对许可有疑问**：读 `licensing.md`
- **想了解项目整体结构**：回到仓库根目录的 [`README.md`](../README.md)
