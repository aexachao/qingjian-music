# TestFlight 0.1.4（49）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 公开组已关联本构建，外部测试状态为 `IN_BETA_TESTING`。
- 构建 ID：`0cf78b36-6b59-430b-8a6d-02cd248df7bb`。

## 修复

- 修复启动时可能出现的 `Unsupported top level event type "topLayout" dispatched`：在 iOS 页面挂载前加载 `RCTView` 的事件配置，使 `topLayout` 与 `onLayout` 的映射提前注册。
- 修正自定义入口顺序。48 版发布 bundle 将静态 `expo-router/entry` 导入提前执行；49 版改为显式 `require`，使错误处理器、播放服务和布局事件配置先于路由挂载。

## 校验

- 移动端 886 项单元测试、类型检查及入口文件 ESLint 检查通过。
- iOS 发布模式 Metro bundle 核对了入口执行顺序；Release 归档和 IPA 导出成功。
- iOS 26.5 模拟器 Release 构建成功，安装后连续四次冷启动均进入登录页，未出现启动错误页。模拟器没有已登录会话，无法覆盖播放中页面和用户的 iOS 18.7.8 真机环境。
- 归档前后 646 个源码及配置文件未变化；已核对商店版标记、构建号、包标识和 App Store 分发描述文件。
- IPA SHA-256：`1d755d7b1d852b18265f85bb34d32c6099ac1889aa894f51cce70cdb3abe38a8`
- JS bundle SHA-256：`f09aa7be5d555a28388da8211fcd60eca16fd4cfe1ef8c4e784b5a923d4dd3da`
- 构建和 App Store Connect 状态记录：`.cache/testflight-20260930-49/`
- 真机复测重点：iPhone 13（iOS 18.7.8）上冷启动、多次退出重进、后台恢复，确认不再弹出 `topLayout` 错误。
