# TestFlight 0.1.4（58）发布记录

> 时点快照：记录当时的实现与验收情况，当前状态以代码和现状基线为准。

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 构建 ID：`4dda1f72-851d-402a-8288-74c8b1fc9731`。
- 已关联公开测试组，外部测试状态为 `IN_BETA_TESTING`。

## 本版内容

1. 设置页行右侧文字与右侧 `>` 的间距调整为 6pt，与缓存二级页保持一致。
2. 设置页顶部用户信息卡片中，在 `fnOS` 右侧显示当前使用的服务器线路地址（`fnOS · url`），并添加小眼睛切换按钮，默认隐藏地址为 `••••••`；移除下方「服务器线路」列表行右侧重复显示的路线名。
3. 统一音乐库页签中的图标与歌曲「···」快捷方式中的图标：艺术家统一为人像图标（`person-circle-outline` / `person.crop.circle`），专辑统一为唱片/专辑图标（`square.stack` / `albums`）。

## 校验

- 移动端 100 个测试文件、938 项单元测试、TypeScript 类型检查全部通过；ESLint 0 错误。
- iOS Release 归档、IPA 导出、App Store 分发签名校验通过。
- IPA SHA-256：`c939083f413d5588ce0009ab0a2cecb4f95fc2a228bd18971b73ed8b94f0da6d`
- JS bundle SHA-256：`543fadb6a17febe19ab3313e18ad51990207b16b558ace72fcda1820e35621fd`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20261002-58/`。
