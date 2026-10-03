# TestFlight 0.1.4（53）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 构建 ID：`82b28f77-2446-4b8a-b68d-7d78d1c26870`。
- 已关联公开测试组，外部测试状态为 `IN_BETA_TESTING`。

## 本版调整

- 包含 52 版的歌词时间高亮修复、按歌曲隔离的歌词偏移、封面暂停缩放，以及歌词页和播放列表的渐变过渡。
- 歌词调整弹窗改为每次 0.1 秒精细微调，增加居中的当前进度文案和常驻重置按钮。
- 细化歌词页与播放列表顶部固定区域、底部工具栏的渐变衔接，并调整页面切换时列表的挂载时机。

## 校验

- 移动端 895 项单元测试和类型检查通过；涉及文件的 ESLint 检查为 0 错误、15 条警告。
- iOS Release 归档、IPA 导出、App Store 分发签名及商店版标记校验通过。归档期间 649 个清单文件哈希未变化。
- IPA SHA-256：`f4f5d923743e6d556f0e25c916af782421288f66fc019f68f09cebe9f5e5d0aa`
- JS bundle SHA-256：`bbdaa266ffeb0e24684cc7ab3447623e347beb20cc847cb01b7c3c91f0e240df`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20260930-53/`。
