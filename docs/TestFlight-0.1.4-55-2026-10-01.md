# TestFlight 0.1.4（55）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 构建 ID：`9fa4139b-e5bb-454d-873c-e25af3ffb033`。
- 已关联公开测试组，外部测试状态为 `IN_BETA_TESTING`。

## 本版内容

- 基于当前工作区打包；相对 54 版包含封面、歌词、播放列表、曲目菜单，以及专辑、首页、搜索和设置页面的源码更新。

## 校验

- 移动端 894 项单元测试、类型检查通过；涉及文件的 ESLint 检查为 0 错误、11 条警告。
- iOS Release 归档、IPA 导出、App Store 分发签名及商店版标记校验通过。归档期间 649 个清单文件哈希未变化。
- IPA SHA-256：`fd95ec92614a771fa8da59d1783e9ec110639b430057a16e062356efef743806`
- JS bundle SHA-256：`0cbd480400fdd52e4cbb909756d59d1a80f380410cb34dad3f09d17079c0fc10`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20261001-55/`。
