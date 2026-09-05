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
