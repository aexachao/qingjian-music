# TestFlight 0.1.4（54）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 构建 ID：`a1078271-6933-4355-a961-2c852377d81f`。
- 已关联公开测试组，外部测试状态为 `IN_BETA_TESTING`。

## 本版调整

- 歌词与播放列表的渐变改为对滚动内容使用透明度遮罩，固定操作区保持清晰，避免整页覆盖层造成突兀的明暗过渡。
- 移除播放器已无用的进场状态，减少一次无意义的状态更新。

## 校验

- 移动端 895 项单元测试和类型检查通过；涉及文件的 ESLint 检查为 0 错误、14 条警告。
- iOS Release 归档、IPA 导出、App Store 分发签名及商店版标记校验通过。归档期间 649 个清单文件哈希未变化。
- IPA SHA-256：`bab1b55f51ffa11cacdd351f1696b866f26503f95e88ec173c2c9d32be1c1d0d`
- JS bundle SHA-256：`1a63173facb232a7edfc249a28e34625fd536eadb9892f43571dd8e59d2d48f4`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20260930-54/`。
