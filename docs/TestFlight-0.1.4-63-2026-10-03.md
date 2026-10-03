# TestFlight 0.1.4（63）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- Build ID: `4b34a224-7772-4bf5-b0e7-46f09d66d587`（Build 63）
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 外部测试状态：`APPROVED`（已通过审核并推送到公开测试组）

## 本版内容

1. **播放列表左右滑动切换 Tab**：
   - 播放列表（`PlayerQueue`）支持在歌曲列表主体区域直接左右滑动，无缝在「继续播放」与「历史记录」Tab 之间平滑切换。
   - 适配 Apple 物理动量与橡皮筋边缘阻尼，支持滑动位移与瞬时初速度双重阈值判断，未达标时自然回弹归位。
2. **手势冲突彻底规避与区域物理隔离**：
   - 将每行歌曲的「左滑删除」触发区域严格限制在右侧控件操作区（竖屏右侧 120pt、横屏右侧 100pt），避免整行左滑误触删除。
   - 列表主体左侧 70%~75% 区域专属于整页 Tab 滑动手势，并屏蔽向右滑动手势被底层拦截的问题。
   - 竖屏与横屏双模式均完成实机与全流程验证，列表纵向滚动与长按拖拽排序体验流畅无干扰。

## 校验

- 移动端 101 个测试文件、949 项单元测试、TypeScript 类型检查全部通过；ESLint 0 错误。
- iOS Release 归档、IPA 导出、App Store 分发签名校验通过。
- IPA SHA256: `b515f328dfbc3f178d9d16167d1c7fa7e1cddbf4dd78fe9f6c8e640a878f9c30`
- JS Bundle SHA256: `64fb45a05caaac623fd31be398c281d06adb96f7ef2c9174a7e4d226cdfa801e`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20261003-63/`。
