# 设计 token 来源对照（飞牛音乐 web 端 → App）

App 的视觉不自己配色，全部对照 web 端的 `--ds-*` 设计变量移植。本文件记录来源与提取方法，
改动 token 时先回查这里。

## web 端技术栈（实测）

| 项目 | 结论 |
| --- | --- |
| 组件库 | Semi Design（`--semi-*` 变量）+ Tailwind（`--tw-*`） |
| 品牌层 | 自建 `--ds-*` 设计变量，共 134 个，暗色/亮色各一套（124 / 133 个） |
| 主题作用域 | `body,:root,:root[data-theme=dark]`（暗）/ `:root[data-theme=light]`（亮）/ 播放器根节点 `.music-player-root(.dark)` |
| 字体 | `--ds-font-family-base: Montserrat, -apple-system, …`，NAS 自带 4 个字重 TTF |
| 图标 | **lucide-react**（bundle 里的 `lucide` className 工厂 + `check` 图标路径 `M20 6 9 17l-5-5` 可确认） |
| 强调色 | 7 个可选：purple `#c934e1`（CSS 出厂默认）/ **red `#f62c55`（本项目采用：飞牛音乐后台的主题色）** / pink `#f05672` / orange `#fc5e25` / yellow `#f8bf28` / green `#6bab45` / blue `#1b73fb` |
| 派生关系 | `--ds-state-playing-color`、`--ds-state-like-color`、`--ds-player-progress-fill`、`--ds-bg-fab` 都 = `--ds-accent-current` |

## 提取方法（可重复）

```bash
# 1. 取首页，列出静态资源
curl -sS http://<NAS>:5666/music/ -o index.html
grep -oE '/music/static/assets/[^"]*\.css' index.html | sort -u

# 2. 下载 CSS，抽出 --ds-* 声明块（暗色块是 body,:root,:root[data-theme=dark]）
#    再把 var() 引用递归解析成字面值
```

## App 侧落点

- `apps/mobile/src/theme/tokens.ts`：`palette.dark` / `palette.light` 逐个对应 `--ds-*`，
  变量名沿用 web 端语义（`bgCard`↔`--ds-bg-card`、`borderDefault`↔`--ds-border-default` …）。
- 颜色保留 web 端的 8 位十六进制（`#ffffff14` = 白 8%），RN 原生支持，方便和 CSS 逐字比对。
- `accents` + `DEFAULT_ACCENT`：与 `[data-theme-accent=*]` 对齐，**固定 red `#f62c55`**（飞牛音乐后台主题色），
  强调色切换留到主题设置一起做。⚠️ web 端 `--ds-special-danger` 与 `--ds-accent-red` 同值，
  **App 这边刻意拆开了** —— 见下面「三层 token」。

## 深浅色模式对比哲学与作用域隔离

1. **暗色模式（Dark）**：
   - 页面背景 `bgPrimary` 为纯黑底（`#0f0f0f`）；
   - 卡片 `bgCard` 为微透浅黑/浮层白（`#ffffff14`），呈现黑底上微浮层的高级感。
2. **浅色模式（Light）**：
   - 页面背景 `bgPrimary` 为柔和系统浅灰（`#f2f2f7`，对齐 iOS systemGroupedBackground）；
   - 卡片 `bgCard` 为纯白（`#ffffff`），按压态 `bgCardHover` 为 `#f0f0f5`；
   - 配合发丝边框 `borderSubtle`（`#0000000f`），在浅灰底上形成清爽分明的内容卡片。
3. **播放页作用域隔离（PlayerScreen）**：
   - 全屏播放器（`/player`）常驻 Dark 作用域（`DarkThemeScope`），不随外层浅色/深色模式切换；
   - 保证专辑模糊背景、发光歌词与白色控制按钮始终处于暗色沉浸式声学氛围中，顶层状态栏保持浅色高亮。

## 三层 token 与颜色使用规范

色值只写在 `apps/mobile/src/theme/tokens.ts`，组件一律用**语义角色**。这样「品牌色太抢眼」
或者「换一套配色」只改映射，不用全局搜索替换。

| 层 | 放什么 | 谁能用 |
| --- | --- | --- |
| L1 调色板 | 具体色值（`palette.dark` / `palette.light` / `accents`） | 只有 `theme/tokens.ts` |
| L2 语义角色 | 见下表 | 组件（`colors.<角色>`） |
| L3 组件 | `src/**` | —— |

| `ctaPrimaryBg` / `ctaPrimaryText` | **高对比主行动胶囊**（对齐 Apple Music）：深色下纯白底深黑字、浅色下纯黑底纯白字。专门用于详情页主播放等焦点 CTA，杜绝彩色大底块 |
| `primaryAction` | 业务强引导主行动（如表单提交、连接确认按钮） |
| `stateSelected` | 选中 / 激活：勾选框、页签、开关、导航高亮、输入光标 |
| `playing` | 正在播放（标题高亮、动态律动条 `LivePlayingBars`） |
| `like` | 收藏（心形）。**独立色值**，与品牌色无关 |
| `danger` | 破坏性动作（删除 / 清空）。**独立色值**（`#ff3b30`），改品牌色不会连累它 |
| `actionText` / `actionTextMuted` / `disabledText` | 普通可点动作 / 次要动作 / 不可点 |
| `brandTint` | 品牌色的**装饰**用法：全局微型加载指示器等（严格限制使用范围，禁止滥用至通用列表行图标） |
| `coverPlaceholder` / `coverPlaceholderMark` | 无封面时的占位**底**与**记号**：浅灰底 + 比底更有存在感的灰记号（不用品牌红）。记号形状取自默认应用图标「绯红声谱」的 15 根竖条，画成矢量（`components/brand-mark.tsx`），且**不跟随设置里切换的启动图标** |
| `accent` | 品牌色本身，**只用于品牌标识**（应用图标预览、关于页）。组件里直接用会被架构守卫拦下 |

### 核心设计纪律与品牌色收敛原则（2026-09-24 校准）

1. **以黑白灰为主导（Neutral Monochrome Core 90%）**：
   - 界面整体以深黑（`#0f0f0f` / `#0A0A0C`）、纯白（`#ffffff`）、层次浅灰（`#ffffffcc` / `#EBEBF5`）、中性灰（`#ffffff99` / `#8E8E93`）构建，保持沉稳克制，让唱片艺术本身成为视觉焦点。
2. **沉浸式动态氛围光（Ambient Aurora Glow）**：
   - 杜绝直接拉伸模糊原始专辑封面（避免人像形变拉伸与条纹残影）；
   - 通过 `theme/ambient-palette.ts` 动态提取唱片主色（`primary`、`secondary`），在屏幕上半部分渲染柔和的高斯模糊弥散光晕，并由渐进式暗化遮罩（Scrim）平滑过渡到深黑底色。
3. **CTA 按键体系（Apple Music 经典规范）**：
   - **主行动（播放全部）**：高对比实体胶囊（`ctaPrimaryBg` / `ctaPrimaryText`），暗色下纯白底黑字，亮色下纯黑底白字；
   - **次行动（随机播放）**：高级微透磨砂玻璃材质（`bgButtonSecondary` + `borderDefault` + `textPrimary`），纯白字与图标；
   - 彻底告别大面积红色胶囊底块！
4. **品牌强调色出场边界（Brand Accent Red 10% 严格收敛）**：
   - ✅ **允许出现的场景**：
     - 当前正在播放的音轨标题与动态声波律动柱（`colors.playing`）；
     - 收藏按钮（心形）激活状态（`colors.like`）；
     - 批量多选复选框打勾状态（`colors.stateSelected`）；
     - 必要的后台扫描进度指示。
   - ❌ **严禁滥用的场景**：
     - 普通 CTA 播放胶囊按键（禁止使用品牌红底块）；
     - 艺术家链接文本与跳转小箭头（必须使用高亮浅灰与次级中性灰）；
     - 音频规格徽章（Hi-Res / FLAC 等必须使用中性细线框药丸，禁止彩色大底或红字）；
     - 通用列表行图标（如资料库分类列表、设置项，禁止将整列图标染红）；
     - 排行榜序号、简介展开提示等次要文本。

四条开发纪律（`scripts/guard-architecture.mjs` 机械检查）：

1. `src/**`（除 `theme/`）**不许出现十六进制颜色字面量**。唯一白名单是致命错误屏
   `apps/mobile/src/components/fatal-error-screen.tsx` —— 它刻意不依赖主题（主题 Provider 可能就是崩掉的那一环）。
2. 组件里**不许直接用 `colors.accent`**，必须走上面的角色。
3. 组件里禁止内联硬编码高饱和度颜色，全部走 `theme/tokens.ts` 与 `theme/ambient-palette.ts`。
4. 页面按钮与文字色彩严格遵从上述品牌色收敛原则。

> 背景：2026-09-15 之前 `accent` 同时表示「选中 / 正在播放 / 收藏 / 可点动作 / 导航高亮」，
> 而 `accent`、`danger`、`like`、`playing` 是同一个值 —— 一屏出现三四处红就吵，
> 且「改品牌色」在结构上做不到（会连累危险色与收藏色）。
- `fonts`：Montserrat 四个字重，文件在 `apps/mobile/assets/fonts/`（OFL 授权，许可证同目录 `OFL.txt`），
  由 `expo-font` 配置插件在构建期嵌入，族名用 TTF 的 PostScript 名（`Montserrat-Regular` 等）。
  **改了字体配置必须重新 `npx expo prebuild --platform ios`**，直接 `expo run:ios` 不会重跑配置插件。
  中文字形 Montserrat 没有，系统会自动回落到 PingFang / Noto Sans CJK —— 与 web 端表现一致。
- 图标：`apps/mobile/src/components/icon.tsx` 用 **Material Icons 面性版**（`@expo/vector-icons/MaterialIcons`，
  字体文件也随 `expo-font` 构建期嵌入）。web 端用的是线性的 lucide，App 这边**故意不跟**：
  移动端播放控制、页签、列表行摆在一起，线性图标会显得一半线一半面、轻重不一；
  Material 的面性版整套都是实心，同一屏里风格才统一。唯一的例外是「收藏」——
  用同族空心变体 `favorite-border` 表示未选中，靠虚实区分开关状态。
  领域层 `BrowseNode.icon` 仍存 SF Symbols 名（CarPlay 需要），由 `iconForSymbol()` 映射过去。
- 图标尺寸六档：`sm 16 / md 20 / lg 24 / xl 28` 给列表、页签、工具栏；
  `xxl 40 / hero 56` 只给正在播放页的传输控制（上一首 / 播放暂停 / 下一首），
  对齐 Apple Music 那种大字形、不带圆形底的按钮。

## 未移植的部分（有意）

- `--ds-glass-*` / `--ds-player-glass-*`：web 端靠 `backdrop-filter` 实现，App 用 `expo-blur` 的原生毛玻璃替代。
- `--semi-*`：Semi Design 组件库内部变量，App 不用该组件库，不移植。
- hover 系列（`*-hover`）：移动端无悬停，仅在需要按压态时取用。
