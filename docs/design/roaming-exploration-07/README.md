# 漫游卡片探索 · 07

2026-10-01。用户要求在现有移动首页基础上探索，不改 App 实现。

保留：148pt 卡片、右侧喜欢/下载、仅未开始与漫游中、曲名与控制留在 mini 播放器；无封面、刻字、重新漫游按钮。iOS 系统字体保持统一，不为候选换整套字体。

方向与骨架：现状为左上文字＋右下半露黑胶；01 上部文字＋下部大比例唱机裁切；02 居中电台＋底部文字；03 上部全幅抽象路径＋底部文字。调性统一安静、精确、中低密度，区别来自器物和构图。灰绿轨道是更冒险的无实物方向。

主 Agent 已通过浏览器检查手机390宽、唱机/电台100%尺寸、状态切换和浅色；修正了唱机轻点提示与图片重叠、电台底边紧贴标题。动画为 HTML 预览：黑胶旋转、唱机光影、电台信号、轨道游标。均能暂停，支持减少动态。未接播放服务，未做原生性能验证、320窄屏及200%文字验收；未进行独立评审。

素材使用内置 image_gen，工具未暴露模型选择，不能确认 gpt-image-2.5。两个生成器物为透明 PNG；当前探索保留原图，选定落地前再做分层与输出尺寸优化。原始文件来自 .codex/generated_images/01a0eab3-79b1-7761-85e8-0adf51f3ee89，工作副本在 assets/。封面色块为本地演示内容，不是真实歌曲数据。

推荐先看01；若要继续精修，建议一轮独立视觉评审，约5–10分钟、一次子Agent调用，加一轮修改复看。先交付选择，不默认派发。

## 素材提示词

### turntable.png

Use case: product-mockup. Generate one isolated premium miniature vinyl record turntable as a transparent PNG asset for a Chinese iOS music app card, no interface or typography. Orthographic three-quarter overhead view, low shallow perspective. Compact rounded rectangular brushed charcoal aluminum chassis, large black vinyl with delicate circular grooves and thin muted burgundy inner ring, tiny spindle hole, elegant silver tonearm resting near outer grooves on right. Minimal black controls, single restrained burgundy indicator. Soft broad studio illumination, exquisite precise manufactured details, restrained realistic material, not cartoon, not toy-like, not glossy chrome. Entire object visible centered, tight composition with 8% transparent padding. No album artwork, no label writing, no engraving, no logos, no cables, no furniture, no backdrop, no floating particles. Transparent background.

### radio.png

Use case: product-mockup. Generate one isolated pocket FM radio as a transparent PNG asset for a Chinese iOS music app card. Front view slightly above, almost orthographic. Horizontal rounded compact body, warm pale silver anodized aluminum, dark finely perforated speaker occupying left two-thirds, narrow dark tuner window near upper right with a tiny muted burgundy needle, one precise circular ridged tuning knob lower right, very short antenna tilted upward. Elegant real industrial design with restrained proportions, soft broad studio lighting. Object fills center with 10% transparent margin, full object visible. No typography, no brand, no digits, no logo, no scenery, no cables, no decorative glow, no interface, no buttons outside object, no album artwork. Subtle manufacturing detail readable at small mobile UI size. Transparent background.
