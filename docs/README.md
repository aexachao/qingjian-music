# 文档索引

| 文档 | 内容 |
| --- | --- |
| [`build-and-ci.md`](./build-and-ci.md) | 在 GitHub Actions 上出 Android APK / iOS 未签名 IPA、用户自签说明、`community` / `store` 发行版切换、开发校验（守卫 / ESLint / vitest） |
| [`fnos-music-api.md`](./fnos-music-api.md) | 飞牛音乐（fnOS Mediasrv）HTTP API 端点参考 |
| [`fnos-transcode.md`](./fnos-transcode.md) | 飞牛转码 HLS 机制：会话、播放列表、分片命名、已知行为 |
| [`design-tokens.md`](./design-tokens.md) | 设计令牌：颜色、排版、间距 |

## 阅读建议

- **想自己构建 / 自签安装**：读 `build-and-ci.md` 的第二节
- **要改 UI**：读 `design-tokens.md` 拿颜色 / 排版 / 间距规范
- **要改 provider 或调接口**：读 `fnos-music-api.md`
- **要动播放架构（本地解码 / 换播放器）**：先读 `fnos-transcode.md`，转码链路的约束都在里面
- **想了解项目整体结构**：回到仓库根目录的 [`README.md`](../README.md)
