# 轻简音乐 · qingjian-music

为 [飞牛 fnOS](https://www.fnnas.com/) 的「音乐」应用（Mediasrv）打造的第三方客户端，
iOS / Android 双端。

本应用**只是播放控制与流媒体连接工具**，不提供、不存储、不分发任何音频资源 ——
你播放的内容全部来自你自己部署的 NAS。

---

## 功能

- **播放**：后台播放、锁屏 / 控制中心 / 车机控制、上一首直切、随机与三档循环
- **歌词**：整屏歌词、逐行高亮、暂停后自由滑动、时间轴偏移可调
- **曲库**：歌曲 / 专辑 / 艺术家 / 流派 / 歌单 / 收藏 / 最近播放 / 播放历史，四路入口（首页 · 曲库 · 搜索 · 设置）
- **搜索**：关键字联想、按类型分标签展示
- **不可播格式兜底**：DSD / APE / WMA 等原生解不了的格式，自动改走服务端转码（HLS）
- **离线缓存**：听过的音频与封面留在本地，弱网与断网也能播；可设容量上限并一键清理
- **音质**：按 Wi-Fi / 蜂窝分别设置偏好（仅在后端真正支持码率档位时生效）
- **外观**：多套配色与图标、深浅色跟随系统
- **多服务器**：可添加并切换多台服务器

## 安装

### Android

从 [Releases](../../releases) 下载 `qingjian-music-android.apk`，传到手机点击安装
（需要允许「安装未知来源应用」）。

### iOS（自签）

iOS 没有付费开发者账号也能装，用你自己的 Apple ID 自签：

1. 从 [Releases](../../releases) 下载 `qingjian-music-unsigned.ipa`；
2. 用 [Sideloadly](https://sideloadly.io/) / [AltStore](https://altstore.io/) / ESign
   等工具，填自己的 Apple ID 导入安装；
3. 免费 Apple ID 签的应用**有效期 7 天**，到期重签一次即可。

> 仓库里发布的是**未签名**包，签名由你在本地完成，我们不接触你的凭据。

### 前提

一台装了「音乐」应用的飞牛 NAS，且手机与它在同一网络（或已做内网穿透）。
首次打开后在登录页填入服务器地址，例如 `http://192.168.1.10:5666`。

## 自己构建

本机不需要装 JDK / Android SDK —— 出包交给 GitHub Actions：

```
Actions → Build → Run workflow
```

打 tag 会自动出包并挂到 Release：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

完整的构建说明、用户自签流程、发行版切换、踩坑记录见
[`docs/build-and-ci.md`](docs/build-and-ci.md)。

## 工程结构

```
apps/mobile            Expo SDK 57 + React Native 0.86 客户端
packages/core-domain   领域模型与能力声明（Track / Album / QueueItem / Capabilities …）
packages/provider-api  音乐源抽象：MusicProvider 契约、连接与注册表
packages/provider-fnos 飞牛 fnOS 实现（端点表、鉴权、HLS 转码会话）
docs/                  构建与 CI、飞牛 API、转码机制、设计令牌
```

「音乐源」是可插拔的：`MusicProvider` 的可选方法由 `capabilities` 门控，
新增一个后端不需要改 UI。

## 开发

需要 Node >= 22 与 pnpm。

```bash
pnpm install
node scripts/verify.mjs     # 架构守卫 + ESLint + 类型检查 + 单测（约 40 秒）
```

> 不要用 `pnpm -r` 跑类型检查 / 测试（会触发 pnpm 的 deps status check 并报
> `EEXIST symlink`）。`verify.mjs` 已经绕开 pnpm，本地和 CI 跑的是同一条命令。

```bash
pnpm start          # 起 Metro
pnpm ios            # 本机跑 iOS
pnpm android        # 本机跑 Android
```

### 项目的几条硬规矩

这些规则都有机械校验兜底，不是靠自觉：

- **纯逻辑一律放 `*-policy.ts`**，且不许 import `react-native` / `expo` ——
  这样单测能直接跑，不用搭一整套 mock（`scripts/guard-architecture.mjs` 会拦）
- **触感统一走 `src/lib/haptics.ts`**，不要在调用点手写 `Haptics.*`
- **存量债务棘轮**：守卫违规数与 ESLint 警告数都记了基线，**只减不增**
- **加校验规则时必须先造一个违规样本验证它会失败** ——
  一条永远通过的规则比没有规则更糟

## 发行版

同一份代码出两种包，由构建期的 `EXPO_PUBLIC_EDITION` 决定：

| 发行版 | 说明 |
| --- | --- |
| `community`（缺省） | 完整功能，不含任何购买链路。GitHub 上发布的就是这个 |
| `store` | 上架 App Store 的商店版，含永久会员购买 |

判定逻辑集中在 `apps/mobile/src/lib/edition-policy.ts`，关于页会显示当前发行版。

## 许可

本仓库目前**没有附任何开源许可文件**，即默认「保留所有权利」：
你可以阅读代码、自行构建并自用，但未经许可不得再分发、修改后分发或用于商业用途。

如果你希望别人能自由使用和修改，需要显式补一份 LICENSE（MIT / Apache-2.0 等）。
这与「商店版含付费会员」是有关联的决策：许可越宽松，
别人自行构建并分发完整功能版本就越没有障碍。

## 致谢

播放体验的部分设计思路参考了 [CyMusic](https://github.com/gyc-12/Cymusic)，
详见 [`NOTICE`](NOTICE)。
