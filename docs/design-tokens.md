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
  强调色切换留到主题设置一起做。注意 `--ds-special-danger` 与 `--ds-accent-red` 同值，web 端亦然，
  破坏性操作靠文案（「退出登录」「清空」）而不是靠颜色区分。
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

## 未移植的部分（有意）

- `--ds-glass-*` / `--ds-player-glass-*`：web 端靠 `backdrop-filter` 实现，App 用 `expo-blur` 的原生毛玻璃替代。
- `--semi-*`：Semi Design 组件库内部变量，App 不用该组件库，不移植。
- hover 系列（`*-hover`）：移动端无悬停，仅在需要按压态时取用。
