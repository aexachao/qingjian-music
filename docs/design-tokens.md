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
| 强调色 | 7 个可选：purple `#c934e1`（默认）/ red `#f62c55` / pink `#f05672` / orange `#fc5e25` / yellow `#f8bf28` / green `#6bab45` / blue `#1b73fb` |
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
- `accents` + `DEFAULT_ACCENT`：与 `[data-theme-accent=*]` 对齐，首版固定默认紫色，主题切换留在 M5。
- `fonts`：Montserrat 四个字重（`@expo-google-fonts/montserrat`，OFL 授权）。中文字形 Montserrat 没有，
  系统会自动回落到 PingFang / Noto Sans CJK —— 与 web 端表现一致。
- 图标：`apps/mobile/src/components/icon.tsx` 用 `lucide-react-native`（与 web 端同一套 lucide 图标）。
  领域层 `BrowseNode.icon` 仍存 SF Symbols 名（CarPlay 需要），由 `iconForSymbol()` 映射到 lucide。

## 未移植的部分（有意）

- `--ds-glass-*` / `--ds-player-glass-*`：web 端靠 `backdrop-filter` 实现，App 用 `expo-blur` 的原生毛玻璃替代。
- `--semi-*`：Semi Design 组件库内部变量，App 不用该组件库，不移植。
- hover 系列（`*-hover`）：移动端无悬停，仅在需要按压态时取用。
