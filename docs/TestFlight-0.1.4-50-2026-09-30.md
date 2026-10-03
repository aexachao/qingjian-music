# TestFlight 0.1.4（50）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 构建 ID：`7acebf24-b13d-4846-b054-2e5d31783a37`。
- 已关联公开测试组，外部测试状态为 `IN_BETA_TESTING`。

## 本版调整

- 修复锁屏与控制中心封面链路：鉴权封面先缓存到本地；iOS 播放器的两条读取路径均可加载本地文件并解码 WebP。快速切歌时优先处理新曲目的封面。
- 播放列表提供艺术家 ID、但名称为空时，异步读取艺术家详情并同步更新 App 内与系统播放器的名称；旧曲目请求不会覆盖新曲目。
- 播放页背景改为由当前封面放大、强模糊并叠加柔和渐变，保留封面卡片清晰显示。

## 校验与复测

- 移动端 890 项单元测试、类型检查通过；本次涉及文件的 ESLint 无错误（播放器桥接文件保留 1 条已有的 Hook 依赖警告）。
- iOS 模拟器 Release 构建成功，安装后可进入登录页；Release 归档、IPA 导出和 App Store 分发签名校验通过。
- 核对了归档期间 647 个源码及配置文件未变化、商店版标记、构建号和包标识。
- IPA SHA-256：`d7486fec9dd9322b2ada94111b4d87800d5a0f46e485b84271d02e53fe4702a4`
- JS bundle SHA-256：`8e25b5d759d9de8b1af502296df7ae4a7ea930beaaddf0a45df90c5c60495871`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20260930-50/`。
- 模拟器无已登录会话，未覆盖真实歌曲和锁屏界面。请在真机检查 WebP/JPEG 封面的锁屏显示、艺术家名称补齐，以及浅色和深色封面的背景观感。
