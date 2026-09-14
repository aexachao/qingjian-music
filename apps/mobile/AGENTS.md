# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 真机构建（iPhone，Release）

一条命令搞定构建 + 安装 + 启动，输出只保留**自己代码**的警告
（node_modules / Pods / jsbundle 的依赖警告全部滤掉，依赖的 `error:` 仍会显示）：

```bash
cd apps/mobile
pnpm ios:device                     # 自动选第一台已连接的设备
pnpm ios:device -- --no-install     # 只构建不安装
```

等价的手动命令（脚本就是这套流程）：

```bash
cd apps/mobile
npx expo prebuild --platform ios          # 改了 app.json / 配置插件 / 字体 / 图标必须重跑
xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Release \
  -destination 'id=<设备 UDID>' -derivedDataPath /tmp/qj-device-build \
  -allowProvisioningUpdates build
xcrun devicectl device install app --device <设备 UDID> \
  /tmp/qj-device-build/Build/Products/Release-iphoneos/app.app
xcrun devicectl device process launch --device <设备 UDID> com.chrisli.music
```

两个必踩的坑：

- **不要给 xcodebuild 改 `HOME`。** 仓库里为了不污染系统会把 npm/pnpm 缓存指到
  `.cache/home`，但 Xcode 账号和登录钥匙串在真实的 `~` 下面。改了 HOME 的表现是
  `No Accounts` + `No signing certificate "iOS Development" found`，看起来像证书没了，其实是找错了家目录。
- `-allowProvisioningUpdates` 要留着：本机的团队通配开发描述文件会被 Xcode 清理掉，
  加上这个参数 xcodebuild 才能用已有的团队开发证书重新拉一份 `com.chrisli.music` 的描述文件。
- 启动前手机必须解锁，否则报 `FBSOpenApplicationErrorDomain error 7 (Locked)`。

# @expo/ui（SwiftUI 组件）：两条会直接崩的规矩

播放页「···」快捷菜单用的就是它（`Menu` / `Button` / `Section`，系统原生样式）。
在模拟器 Release 包上实测踩过两个挂载即崩（SIGABRT）的坑：

- **SwiftUI 组件不能直接放进 RN View 里，必须包一层 `<Host>`**（`@expo/ui/swift-ui`）。
  否则 Fabric 把它挂进 UIKit 层级时，`SwiftUIVirtualViewObjC` 抛
  "Wrap your component with `<Host>`" 然后直接 abort——报错信息本身写明了修法。
- **`Menu` 的 `label` 只能传字符串（配合 `systemImage`），不能传 ReactNode**。
  ReactNode 会走 Slot 机制往 SwiftUIVirtualView 里挂 RN 子视图，57.0.16 上必崩。
  想要纯图标触发器就 `label=""` + `systemImage="ellipsis"`，颜色用 `tint` 修饰器、
  命中区用 `frame({ minWidth: 44, minHeight: 44 })`。

已知代价：`label=""` 时 VoiceOver 拿不到按钮的可读名（SwiftUI 菜单按钮的无障碍名来自 label 文本）。

# 导航栏：大标题和 headerStyle 不能同时用（iOS 26）

iOS 26 上给 Stack 设了 `headerStyle: { backgroundColor }` 之后，`headerLargeTitle`
的标题**不显示**——导航栏留着大标题的高度，但字没了（实测 react-native-screens 4.26 +
iOS 26.5 模拟器，逐项二分确认是 headerStyle 引起的，headerTintColor / headerTitleStyle /
headerShadowVisible 都没问题）。

所以底色统一走导航主题：`src/lib/stack-options.ts` 里的 `navigationTheme`（`colors.card`
就是导航栏底色），在根布局用 expo-router 导出的 `ThemeProvider` 套上，任何 Stack 都不要再写
`headerStyle`。另外用 `headerLargeTitle` 的屏，滚动容器必须加
`contentInsetAdjustmentBehavior="automatic"`，否则大标题不会跟着滚动收起。

# 模拟器验证：能截图，不能注入触摸

`xcrun simctl io <UDID> screenshot` + `.cache/tools/ocr.swift` 可以逐页核对文案和位置；
但 CGEvent 合成点击（`.cache/tools/tap.swift`）在没有辅助功能授权时不会送达，实测点页签没反应。
需要「跳到某个页面 / 触发某个动作」时，临时加一个 `src/app/dev-ui.tsx` 夹具页
（把 `app/index.tsx` 的 Redirect 指到它），改夹具里的常量靠 Fast Refresh 就能换页面，
验完删掉夹具并还原 index。手势类（左滑返回）只能真机验。

模拟器 Debug 构建如果挂在链接期、报一堆 `facebook::react::Sealable` / `ShadowNode::getDebugName`
之类的未定义符号（xcodebuild error 65），是 `ios/` 目录与当前依赖状态脱节 ——
`npx expo prebuild --platform ios --clean && npx pod-install` 后重跑即可（2026-09-15 实测，
清 DerivedData 没用）。

再补两个可用的量化手段（都在 `.cache/tools/`）：

- `xscan.swift <png> <y起> <y止>`：扫一条横带里的亮像素 x 聚簇，用来确认
  「指示器到底居中没有」「三个按钮的水平位置」这类事，比让视觉模型猜靠得住。
- `boxcolor.swift <png> <x0> <y0> <x1> <y1>`：取矩形内非背景像素的平均色，
  用来验证「选中态是不是强调色 #f62c55」。

# 本地原生模块（modules/）

`modules/airplay-button` 是一个本地 Expo 原生模块（包了系统的 `AVRoutePickerView`，
iOS 的输出设备选择面板没有公开 API 能用代码直接弹）。结构就是官方那套：
`expo-module.config.json` + `ios/*.podspec` + `ios/*.swift` + `index.ts`，
autolinking 会自动扫 `modules/*`。

加了或改了本地原生模块之后：**必须重跑 `npx expo prebuild --platform ios` 再重新构建原生工程**，
只重启 Metro 是不够的（JS 那边 `requireNativeView` 找不到原生视图会直接崩）。
