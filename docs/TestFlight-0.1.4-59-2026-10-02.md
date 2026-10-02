# TestFlight 0.1.4（59）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 构建 ID：`a680b840-d5ed-4f64-9d22-74b1d3052af9`。
- 已关联公开测试组，外部测试状态为 `IN_BETA_TESTING`。

## 本版内容

1. **歌词页设置按钮位置优化**：歌词时间调整按钮移至屏幕右侧，并上提距底部工具栏 24pt，留出充裕的操作空间与呼吸感。
2. **服务器地址与 FN ID 统一格式化与隐藏**：
   - 设置页顶部用户信息、登录页输入框以及登录历史列表中，隐藏服务器地址开头的 `http://` / `https://` 前缀。
   - 官方中继域名下的 FN ID 只显示 ID 本身，隐藏完整域名（`.fnos.net` / `.5ddd.com` / `.trzznas.com`）。
3. **缓存详情页体验提升**：
   - 修复缓存容量与数量上限卡片文字未垂直居中的问题（移除外层多余 flexWrap 与间距）。
   - 将最下方的「清理缓存」操作按钮由胶囊按钮改为原生文字按钮样式，并在清理时显示进度指示器。
   - 精简设备存储空间统计项目：统一为「轻简音乐下载」、「缓存」、「其他应用」与「可用空间」4 项。
4. **播放器转场性能优化**：播放封面与播放列表切换掉帧排查与优化，消除容器重排，列表与歌词组件后台常驻预热。

## 校验

- 移动端 100 个测试文件、941 项单元测试、TypeScript 类型检查全部通过；ESLint 0 错误。
- iOS Release 归档、IPA 导出、App Store 分发签名校验通过。
- IPA SHA-256：`850c6b3f77699b9ea659fbb4e6c44db730ba1531fff7a42990e9dd011314868a`
- JS bundle SHA-256：`b5d4763164eeb27fc1173b9538b133ac7de3a9e964534ac6bc4c6a8ed518f25a`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20261002-59/`。
