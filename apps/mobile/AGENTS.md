# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 真机构建（iPhone，Release）

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
