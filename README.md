<p align="center">
  <img src="./assets/readme/hero.svg" width="100%"
       alt="轻简音乐 — 为飞牛 fnOS 打造的精致移动端音乐播放器">
</p>

<h2 align="center">为飞牛 fnOS 音乐服务打造的精致移动端客户端</h2>

<p align="center">
  <a href="../../releases">📦 Releases</a> ·
  <a href="docs/build-and-ci.md">🔧 构建文档</a> ·
  <a href="CONTRIBUTING.md">🤝 参与贡献</a>
</p>

---

<img src="./assets/readme/section-features.svg" width="100%" alt="功能特性">

## 核心能力

| 能力 | 说明 |
|------|------|
| **播放** | 后台播放、锁屏 / 控制中心 / 车机控制、上一首直切、随机与三档循环 |
| **歌词** | 整屏歌词、逐行高亮、暂停后自由滑动、时间轴偏移可调 |
| **曲库** | 歌曲 / 专辑 / 艺术家 / 流派 / 歌单 / 收藏 / 最近播放 / 播放历史 |
| **搜索** | 关键字联想、按类型分标签展示 |
| **格式兜底** | DSD / APE / WMA 等不可播格式自动走服务端 HLS 转码 |
| **离线缓存** | 听过的音频与封面自动本地缓存，弱网断网可续播；支持容量上限与一键清理 |
| **音质偏好** | Wi-Fi / 蜂窝分别设置偏好（仅在后端真正支持码率档位时生效） |
| **外观** | 多套 App 图标、深浅色跟随系统 |
| **多服务器** | 可添加并切换多台飞牛 NAS |

> 本应用**仅作为播放控制与流媒体连接工具**，不提供、不存储、不分发任何音频资源 —— 你播放的内容全部来自你自己部署的 NAS。

---

<img src="./assets/readme/section-install.svg" width="100%" alt="安装">

## 安装

### Android

从 [Releases](../../releases) 下载 `qingjian-music-android.apk`，传到手机点击安装（需要允许「安装未知来源应用」）。

### iOS（自签）

没有付费开发者账号也能装，用你自己的 Apple ID 自签：

1. 从 [Releases](../../releases) 下载 `qingjian-music-unsigned.ipa`；
2. 用 [Sideloadly](https://sideloadly.io/) / [AltStore](https://altstore.io/) / ESign 等工具导入安装；
3. 免费 Apple ID 签的应用**有效期 7 天**，到期重签一次即可。

> 仓库发布的是**未签名**包，签名由你在本地完成，我们不接触你的凭据。

### 前提

一台装了「音乐」应用的飞牛 NAS，且手机与它在同一网络（或已做内网穿透）。
首次打开后在登录页填入服务器地址，例如 `http://192.168.1.10:5666`。

---

<!-- 截图展示预留区 —— 后续可替换为真实 App 截图 -->
<!-- <p align="center">
  <img src="./assets/readme/screenshot-player.png" width="32%" alt="播放器">
  <img src="./assets/readme/screenshot-lyrics.png" width="32%" alt="歌词">
  <img src="./assets/readme/screenshot-library.png" width="32%" alt="曲库">
</p> -->

---

<img src="./assets/readme/section-dev.svg" width="100%" alt="开发">

## 工程结构

```
apps/mobile            Expo SDK 57 + React Native 0.86 客户端
packages/core-domain   领域模型与能力声明（Track / Album / QueueItem / Capabilities …）
packages/provider-api  音乐源抽象：MusicProvider 契约、连接与注册表
packages/provider-fnos 飞牛 fnOS 实现（端点表、鉴权、HLS 转码会话）
docs/                  构建与 CI、飞牛 API、转码机制、设计令牌
```

「音乐源」是可插拔的：`MusicProvider` 的可选方法由 `capabilities` 门控，新增一个后端不需要改 UI。

## 本地开发

需要 Node >= 22 与 pnpm。

```bash
pnpm install
node scripts/verify.mjs     # 架构守卫 + ESLint + 类型检查 + 单测（约 40 秒）
```

> 不要用 `pnpm -r` 跑类型检查 / 测试（会触发 pnpm 的 deps status check 并报 `EEXIST symlink`）。`verify.mjs` 已经绕开 pnpm，本地和 CI 跑的是同一条命令。

```bash
pnpm start          # 起 Metro
pnpm ios            # 本机跑 iOS
pnpm android        # 本机跑 Android
```

### 几条硬规矩

这些规则都有机械校验兜底，不是靠自觉：

- **纯逻辑一律放 `*-policy.ts`**，且不许 import `react-native` / `expo` —— 单测能直接跑
- **触感统一走 `src/lib/haptics.ts`**，不要在调用点手写 `Haptics.*`
- **存量债务棘轮**：守卫违规数与 ESLint 警告数都记了基线，**只减不增**
- **加校验规则时必须先造一个违规样本验证它会失败** —— 一条永远通过的规则比没有规则更糟

## 自己构建

本机不需要装 JDK / Android SDK —— 出包交给 GitHub Actions：

```
Actions → Build → Run workflow
```

打 tag 会自动出包并挂到 Release：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

完整的构建说明见 [`docs/build-and-ci.md`](docs/build-and-ci.md)。

## 发行版

同一份代码出两种包，由构建期的 `EXPO_PUBLIC_EDITION` 决定：

| 发行版 | 说明 |
|--------|------|
| `community`（缺省） | 完整功能，不含任何购买链路。GitHub 上发布的就是这个 |
| `store` | 上架 App Store 的商店版，含永久会员购买 |

判定逻辑集中在 `apps/mobile/src/lib/edition-policy.ts`，关于页会显示当前发行版。

---

## 许可

本项目采用**双轨许可**：

| 发行版 | 许可 |
|--------|------|
| **社区版**（本仓库；GitHub 上分发的自签 IPA / 直装 APK） | **GPL-3.0-only** |
| **商店版**（App Store 上架版，含永久会员购买） | 单独的**商业许可**，不适用 GPL |

社区版会一直保持 GPL-3.0：你可以自由使用、修改、再分发，而**衍生物也必须开源**—— 不会出现拿本项目代码做闭源竞品的情况。全文见 [`LICENSE`](LICENSE)。

> 商店版之所以不受 GPL 约束，唯一依据是**版权集中在项目所有者手里**。因此本项目要求贡献者同意 CLA —— 详见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

### 为什么是 GPL-3.0 而不是 AGPL-3.0

AGPL-3.0 就是「GPL-3.0 + §13」，其余条款逐字相同。而 §13 约束的是「修改后**通过网络远程**给用户使用」的**服务端**程序；本项目是手机客户端，用户把包下载到本地运行，§13 永远不会触发。也就是说 AGPL 只会多出劝退成本（不少公司有明令禁止引入 AGPL 的合规政策），不带来本项目需要的任何额外保护。

将来若真的自建服务端组件（代理 / 聚合 / 同步），把**服务端那部分**换成 AGPL-3.0、客户端继续 GPL-3.0 即可 —— GPL 与 AGPL 混合是明文允许的（AGPL §13 第二段）。

### 与 App Store 的关系

GPL / AGPL 与 App Store 条款本身是冲突的：§6 反 Tivoization 要求「能让用户安装修改版」，§10 禁止对下游附加限制，而 Apple 的 EULA 恰恰是附加限制（VLC 2011 年因此被下架）。商店版能上架的依据**不是**「GPL 没问题」，而是版权所有者给自己另发了一份商业许可，商店版因此不适用 GPL。

---

## 致谢

播放体验的部分设计思路参考了 [CyMusic](https://github.com/gyc-12/Cymusic)，详见 [`NOTICE`](NOTICE)。
