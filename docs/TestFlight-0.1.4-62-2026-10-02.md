# TestFlight 0.1.4（62）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- Build ID: `d77a00f0-dfa3-4d56-bc5a-1fc372da92db`（Build 62）
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 外部测试状态：`IN_BETA_TESTING`（已关联公开测试组）

## 本版内容

1. **同步原生 iOS AppIcon 与启动图资源**：
   - 彻底解决 iOS 桌面图标与启动 Splash 图标未同步的问题：直接将全新矢量生成的图标资源同步至原生工程 `apps/mobile/ios/app/Images.xcassets`（包含默认 `AppIcon.appiconset`、3 款多 Logo 切换的 `AppIcon*.appiconset` 以及 `SplashScreenLogo.imageset` 的 1x/2x/3x 启动图）。
   - 用户安装后桌面上即展示全新纤细灵动的轻简音符 Logo，启动冷启过程展示对应全新高保真启动图。

## 校验

- 移动端 100 个测试文件、941 项单元测试、TypeScript 类型检查全部通过；ESLint 0 错误。
- iOS Release 归档、IPA 导出、App Store 分发签名校验通过。
- IPA SHA256: `b003926c19fd92ae26c3c20f9435bab9d12c276d1402f68afce7f7d88fb8ff9b`
- JS Bundle SHA256: `4e1e8642d3e73d0c52a11a8bf4d869b21dbbed99dbe8f535420ad2ed35c6cfab`
