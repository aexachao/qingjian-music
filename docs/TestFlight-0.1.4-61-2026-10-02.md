# TestFlight 0.1.4（61）发布记录

- 应用：轻简音乐，`com.chrisli.music`，App Store Connect ID `6813079351`。
- 公开测试链接：https://testflight.apple.com/join/tetMDTQY
- 构建 ID：`fc25927b-6274-4da6-9e45-adc2143443c6`。
- 已关联公开测试组，外部测试状态为 `IN_BETA_TESTING`。

## 本版内容

1. **全新品牌 Logo 高保真矢量化与上线**：
   - 将全新「轻简音符」品牌 Logo 重构为数学级平滑三次贝塞尔矢量样条曲线（$C^1$ 连续相切），杆身更纤细轻盈（斜率 $\approx 11.6^\circ$），右上尾翼律动舒展，与设计原图交并比（IoU）达到 99.696%。
   - 背景提取三色线性对角渐变（`#F96165` -> `#F4285E` -> `#E50960`），全图信噪比 PSNR 达到 41.82 dB。
2. **全端资产与组件同步更新**：
   - 更新组件 [`brand-mark.tsx`](file:///Users/chrisli/Documents/dev/qingjian-music/apps/mobile/src/components/brand-mark.tsx)（紧致包围盒 `331 191 398 648`，用于无封面音乐占位与品牌记号水印）。
   - 更新应用内外观设置所有 4 款 Logo 切换源文件与高清预览（经典绯红、纯白绯音、暗夜流光、黑曜赤弦）。
   - 更新主矢量文件 [`logo.svg`](file:///Users/chrisli/Documents/dev/qingjian-music/apps/mobile/assets/images/logo.svg)、[`brand-note.svg`](file:///Users/chrisli/Documents/dev/qingjian-music/apps/mobile/assets/images/brand-note.svg)、iOS 启动/桌面图标、Android 自适应与前景色图标。

## 校验

- 移动端 100 个测试文件、941 项单元测试、TypeScript 类型检查全部通过；ESLint 0 错误。
- iOS Release 归档、IPA 导出、App Store 分发签名校验通过。
- IPA SHA-256：`ab71c2dd6ea6904684781b7bc6133bfb25a3c8fe5d71c6f04fda0802ea5b1de2`
- JS bundle SHA-256：`4e1e8642d3e73d0c52a11a8bf4d869b21dbbed99dbe8f535420ad2ed35c6cfab`
- 构建、签名及 App Store Connect 状态记录：`.cache/testflight-20261002-61/`。
