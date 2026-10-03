# TestFlight 0.1.4（60）发布记录

> 时点快照：记录当时的实现与验收情况，当前状态以代码和现状基线为准。

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 构建 ID：`bc999d46-ce8a-45d5-a46c-54888f151880`。
- 已关联公开测试组，外部测试状态为 `IN_BETA_TESTING`。

## 本版内容

1. **设置页大标题间距统一**：
   - 将设置页顶部个人信息卡片与大标题的间距调整为 16pt，消除此前 content 容器直接应用 gap 带来的 28pt 过宽留白，与首页、音乐库等主标签页视觉严格对齐。
2. **移除设置页分组标题**：
   - 移除设置页「体验」、「内容与服务」、「帮助与关于」模块标题，整体呈现干净统合的 iOS Inset Grouped 分组卡片风格。

## 校验

- 移动端 100 个测试文件、941 项单元测试、TypeScript 类型检查全部通过；ESLint 0 错误。
- iOS Release 归档、IPA 导出、App Store 分发签名校验通过。
- IPA SHA-256：`689b4fdc71236e4d31edc11d3985e9441bf766b95bf6517e6c53ddd92038d249`
- JS bundle SHA-256：`9ea97dbecfac92a65d1812cc45bb851a4cf86d01f198c55b5213b13755f03d78`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20261002-60/`。
