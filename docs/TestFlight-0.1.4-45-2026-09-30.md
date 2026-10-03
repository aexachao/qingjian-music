# TestFlight 0.1.4（45）发布记录

> 时点快照：记录当时的实现与验收情况，当前状态以代码和现状基线为准。

- 应用：轻简音乐，com.chrisli.music，App Store Connect ID 6813079351。
- 商店版，目标为现有“公开测试”组。
- 公开链接：https://testflight.apple.com/join/tetMDTQY
- 当前状态：Apple 处理完成，已加入“公开测试”组，外部状态 IN_BETA_TESTING，已可下载。
- 构建 ID：04694865-f452-45fd-b5c1-274ffd7ef444。
- 已复核公开组关联、中文测试说明和 autoNotifyEnabled=true。

## 内容

歌词源变更立即刷新当前歌曲、当前及后续 10 首歌词预取、加载图标浅黑深白、下拉刷新安全区偏移；包含此前尚未分发的网络设置二级页、存储占用图表、服务器多线路配置与故障切换。

## 校验

- 上轮代码验证：1,040 项测试、四个包类型检查及 iOS Release 构建通过。
- 发布：构建号 44 → 45，重新 prebuild、安装 Pods、签名归档、导出 IPA。
- 641 个源码及配置文件在归档前后保持一致；已验证商店版标记、关键功能代码、版本、包标识和 App Store 分发描述文件。
- 首次上传因 Apple 对象存储请求超时失败；延长超时并并发上传后成功提交。
- IPA SHA-256：dc9be415c70429104bbcf1269b38d2490f602f5566ed124e43d5bbf3751f33d6
- JS bundle SHA-256：4c739eca7dd37de346172d6e8ae4b2a04c2248e55a69caffec0942917b40306e
- 日志和校验记录：.cache/testflight-20260930-45/
- 真机体验仍需测试；编译、上传不代表真机验收完成。
