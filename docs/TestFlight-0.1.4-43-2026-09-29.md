# TestFlight 0.1.4（43）发布记录

- 日期：2026-09-29。
- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 发行版：商店版（store）。
- 目标：现有外部测试组“公开测试”。
- 公开链接：https://testflight.apple.com/join/tetMDTQY
- 当前状态：Apple 处理完成，已加入“公开测试”并提交测试审核；最终外部测试状态为 `IN_BETA_TESTING`，已可下载。
- 构建 ID：`2503dacb-f0f0-4a3c-bec1-ebaf6077957c`。
- 远程复核：公开测试组确实关联该构建，中文测试说明与本地发布说明一致，`autoNotifyEnabled=true`。

## 本次内容与验证

包含[弱网切歌补修](./弱网切歌补修-2026-09-29.md)，对应 912 项单元测试、4 包类型检查通过的源码。仅将构建号从 42 升至 43，并重新 prebuild、签名归档和导出。

最终归档和导出均成功。检查了包标识、版本号、构建号、实际 Hermes 字节码中的商店版标记，以及 App Store 分发描述文件。260 个源码与配置文件在归档前后未变化，IPA 中的 JS bundle 与已校验归档一致。

- IPA：`apps/mobile/.asc/artifacts/qingjian-0.1.4-43.ipa`
- 归档：`apps/mobile/.asc/artifacts/qingjian-0.1.4-43.xcarchive`
- IPA SHA-256：`0bbf59d2ab24bef0cc4e341978dff2f08decbbe351a69760ffea9ff81b09e2ce`
- JS bundle SHA-256：`6af4525a90c11e86dbf83d3dca024f26a0bc38664b9d041a1b6369e305a1c4b5`
- 日志、测试说明和源码清单：`.cache/testflight-20260929-43/`。

## 发布过程中发现并处理的配置问题

初次实际产物检查发现发行版仍为 community，未上传该包。随后确认本机 Expo 57 的 `export:embed` 在 CI 模式下会禁用命令行要求的缓存重置，因此单独改变发行版变量仍可能复用旧变换结果。

最终归档对 Xcode 显式传入 `EXPO_PUBLIC_EDITION=store NODE_ENV=production CI=false`，使本次 Metro 重建实际生效；再次反汇编最终归档中的 Hermes 字节码，确认 `EDITION=store`、`isCommunityEdition=false` 后才导出和上传。不得仅凭构建命令中的环境变量判断最终发行版。

## 建议设备测试

1. 歌曲加载或缓冲时点击上/下一首，歌名与封面立即切换到选中目标。
2. 连续上一首、连续下一首、前后交替点击，最终目标与最后操作一致。
3. 断网后恢复网络，检查重试播放、历史记录和待播顺序。

音频出声仍取决于网络缓冲。设备验证结果与 Apple 的构建/外部测试状态分别记录，不将上传成功当成可下载或真机验收通过。
