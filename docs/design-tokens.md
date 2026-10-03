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
| `loadingIndicator` | 加载指示器的中性颜色：暗色主题纯白、浅色主题纯黑；不随品牌色变化 |
| `brandTint` | 品牌色的**装饰**用法：设置入口的小图标、Hub 卡、封面占位等（严格限制使用范围，禁止滥用至通用列表行图标） |
| `coverPlaceholder` / `coverPlaceholderMark` | 无封面时的占位**底**与**记号**：浅灰底 + 比底更有存在感的灰记号（不用品牌红）。记号形状取自官方应用图标「轻简音符」的灵动音符，画成矢量（`components/brand-mark.tsx`），且**不跟随设置里切换的启动图标** |
| `storageChartDownloads` / `storageChartAudio` / `storageChartLyrics` / `storageChartArtwork` / `storageChartOther` | 仅用于存储容量分段条与图例的分类颜色，独立于品牌色；可用空间沿用 `bgProgressTrack`，同时以文字容量区分，不依赖颜色传意 |
| `accent` | 品牌色本身，**只用于品牌标识**（应用图标预览、关于页）。组件里直接用会被架构守卫拦下 |

### 核心设计纪律与品牌色收敛原则（2026-09-24 校准）

1. **以黑白灰为主导（Neutral Monochrome Core 90%）**：
   - 界面整体以深黑（`#0f0f0f` / `#0A0A0C`）、纯白（`#ffffff`）、层次浅灰（`#ffffffcc` / `#EBEBF5`）、中性灰（`#ffffff99` / `#8E8E93`）构建，保持沉稳克制，让唱片艺术本身成为视觉焦点。
2. **沉浸式动态氛围光（Ambient Aurora Glow）**：
   - 杜绝直接拉伸模糊原始专辑封面（避免人像形变拉伸与条纹残影）；
   - 通过 `theme/ambient-palette.ts` 动态提取唱片主色（`primary`、`secondary`），在屏幕上半部分渲染柔和的高斯模糊弥散光晕，并由渐进式暗化遮罩（Scrim）平滑过渡到深黑底色。
3. **详情页双动作胶囊规范（2026-09-25 平权次级胶囊原则）**：
   - **双动作同级平权**：在专辑、歌单、流派、收藏、艺术家等所有详情页中，并排的两枚主操作胶囊（如「播放全部」+「喜欢」/「添加到队列」）**统一采用 `secondaryButton` 风格**（高级微透磨砂玻璃材质 `bgButtonSecondary` + `borderDefault` + 纯白文字与图标 `textPrimary`）；
   - **杜绝单侧强引导纯白底块**：严禁在双胶囊并列场景中使用刺眼的 100% 纯白实心大底（`ctaPrimaryBg`），避免强引导破坏黑胶/发烧友暗黑界面的沉浸静谧感，保持两枚探索操作在视觉重心上的绝对平衡；
   - **收藏激活态高亮**：已喜欢时，仅将心形图标与文字高亮切换为 `colors.like`，边框切换为 `colors.borderEmphasis`，整体几何形态与背景色保持与相邻按钮完全对称；
   - 彻底告别大面积红色胶囊底块与失衡对比！
4. **品牌强调色出场边界（Brand Accent Red 10% 严格收敛）**：
   - ✅ **允许出现的场景**：
     - 当前正在播放的音轨标题与动态声波律动柱（`colors.playing`）；
     - 收藏按钮（心形）激活状态（`colors.like`）；
     - 批量多选复选框打勾状态（`colors.stateSelected`）；
     - 必要的后台扫描进度指示。
   - ❌ **严禁滥用的场景**：
     - 普通 CTA 播放胶囊按键（禁止使用品牌红底块）；
     - 模态弹窗顶部导航与完成按钮（「完成」等常规关闭动作严禁使用品牌红，统一使用 `colors.textPrimary` 高对比白字，对齐 iOS HIG）；
     - 常规非破坏性弹窗确认按钮（输入框/确认框「确定」使用 `colors.ctaPrimaryBg` / `ctaPrimaryText` 高对比黑白胶囊，严禁染红；红色仅留给 `colors.danger` 破坏性删除）；
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
- `fonts`：全面采用平台原生系统字体（iOS: San Francisco + PingFang SC；Android: Roboto + Noto Sans SC），
  无需打包外部 TTF 字体，节省包体积 1.3MB+，冷启动无字体加载延迟，字重渲染与系统动效完美贴合 Apple 原生规范。
  在 `tokens.ts` 中通过 `Platform.select({ ios: 'System', default: '...' })` 结合显式 `fontWeight`（`400` / `500` / `600` / `700`）实现精准排版。
- 图标统一从 `apps/mobile/src/components/icon.tsx` 使用；当前跨平台字形为 Ionicons，歌词、队列等少数字形使用共享 SVG。iOS 原生快捷菜单使用 SF Symbols。
  同一对象应保持一致的基础图形；对象入口与添加、移除等动作可以不同。音乐库与菜单的专辑、艺术家等映射仍有历史差异，尚未完成统一。
  播放器工具栏的模式按钮未选中使用线性字形，选中使用面性镂空字形；收藏仍以虚实表达状态。封面页的主要播放控制保持面性字形。
  领域层 `BrowseNode.icon` 存 SF Symbols 名（CarPlay 需要），由 `iconForSymbol()` 映射到当前字形。
- 图标尺寸六档：`sm 16 / md 20 / lg 24 / xl 28` 给列表、页签、工具栏；
  `xxl 40 / hero 56` 只给正在播放页的传输控制（上一首 / 播放暂停 / 下一首），
  对齐 Apple Music 那种大字形、不带圆形底的按钮。

## 未移植的部分（有意）

- `--ds-glass-*` / `--ds-player-glass-*`：web 端靠 `backdrop-filter` 实现。App 悬浮 tabbar 与 MiniPlayer 在支持的 iOS 上使用 `expo-glass-effect` 原生玻璃，其他 iOS 回退为 `expo-blur`，Android 使用实色表面。
- `--semi-*`：Semi Design 组件库内部变量，App 不用该组件库，不移植。
- hover 系列（`*-hover`）：移动端无悬停，仅在需要按压态时取用。

## 首页漫游装饰

- `roamingDeck` / `roamingDeckFront`：唱片机机身与前面板。
- `roamingMetal`：唱臂与转轴金属材质。
- `roamingRecordLabel`：唱针末端的低饱和材质点缀；全局播放状态继续使用 `playing`。
- 漫游卡片基础高度 124 pt，并随系统文字大小扩展。Tabbar 的按钮区高 64 pt，背景贴底延伸覆盖底部安全区，仅顶部两角使用 20 pt 圆角；选中页签仅改变图标和文字颜色。MiniPlayer 与 tabbar 保持 8 pt 间距，使用 20 pt 圆角的实色卡片，各系统版本不切换为玻璃胶囊。

- `roamingLamp` / `roamingLampCore`：播放指示灯与灯芯；暂停降至 20%，未开启熄灭。
- `roamingAmbient`：漫游边缘柔光；未开启 9%、暂停 20%、播放渐亮并缓慢移动。

- 漫游三层柔光限制在右下角唱片机背后和底部，类似设备环境背光，文字区保持安静。共享 32 秒局部聚散周期，同时小幅改变横纵比例、大小与角度，聚合时降低亮度。深色模式使用低明度玫瑰、琥珀、紫色，浅色模式保留淡玫瑰、淡杏、灰紫。保持未开启、暂停时的低亮度与减少动态效果支持。
- 漫游标题沿用 `typography.title3` 系统字体，只把“漫游”染成 `roamingTitleAccent` 的低饱和玫瑰色。副文案和状态使用 `roamingSupportingText`：深色模式 68% 白，浅色模式 68% 近黑，让背景光自然影响文字合成色，同时保留可读性。
- 漫游状态文字统一 18 pt 行高和左侧起点；“开启中”的加载圈放在文字右侧 12 pt 槽位内，不替换状态文字。
- 漫游卡片使用局部渐变边光：左上角较亮、右下角更弱，边缘中段透明；亮度跟随漫游状态渐变，不做独立绕圈动画。颜色复用 `roamingTitleAccent`。
- 我喜欢的、已下载使用固定的局部渐变边光，分别复用 `homeFavoritesGlow` 和 `homeDownloadsGlow`。强度低于漫游播放态，无动画；原有极浅的角落底色保持。

- `roamingLabelPaper`：唱片标签纸底及封面的细边。当前封面缺失或加载失败时继续显示纸底与偏心刻痕。
- `homeFavoritesGlow` / `homeDownloadsGlow`：首页收藏与下载卡片右下角的静态柔光，仅装饰，不表达播放或加载状态。

- 首页局部描边独立使用 `roamingEdge` / `homeFavoritesEdge` / `homeDownloadsEdge`：深色沿用柔光色，浅色改用低饱和、较深的玫瑰与蓝灰，在白色卡片上保留细腻轮廓；背景柔光颜色与强度不随描边一起加重。浅色漫游未开始时也保留可辨认的局部边缘，播放态只小幅增强。

播放器底部模式切换：未选中使用线性字形，选中使用 `playerToolbarSelected` 的局部圆角底与透明镂空面性字形，透出真实背景；不使用品牌红。歌词设置在左，播放/暂停和下一首在同一行最右侧；播放控制使用面性图标、36 pt 圆底并保留 44 pt 命中区。底部工具栏始终只保留歌词、音频输出、队列三个入口；播放控制使用 `playerToolbarControl` 浅圆底，与模式切换区分。音频输出显示真实路由名称，中性图标，名称单行中间省略并保留完整无障碍标签。
