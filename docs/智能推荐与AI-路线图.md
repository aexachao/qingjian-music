# 智能推荐与 AI 融合 · 设计路线图

> 本地 NAS 听歌场景的推荐系统与 AI 能力设计。库来源是「别人整理并分享、转存到自己网盘」
> 的曲库，因此：**无冷启动信号、元数据脏、用户不了解自己的库、不知道缺什么**。
> 这份文档是多轮迭代的主线,别丢。

最后更新：2026-09-26

---

## 0. 数据源原则（2026-09-27 定）

**默认只用飞牛音乐的数据，不内置任何外部源。** 已清掉 Last.fm / Deezer / 维基百科
（删 `lib/lastfm.ts` + 艺人页相关查询）。艺人写真改用飞牛自带的 artist coverId；
简介/标签/听众数/相似艺人飞牛不提供，暂隐藏，**待用户填写国内源后再显示**。
国内源（网易云/QQ/豆瓣/百度百科）都无官方开放 API、只能逆向或爬，故不内置、由用户自填域名
（与 AI 供应商同一套“用户自带”哲学）。

### 0.0.1 已落地：外部数据源设置 + 逐字歌词（2026-09-27）

- 设置 → **外部数据源**（`screens/external-sources.tsx`）：按功能分两项，默认都关。
  - 歌词源：关闭 / 网易云(逐字) / LrcAPI；音乐信息源：关闭 / 网易云 / QQ。各项 = 类型 + 地址 + token + 测试连接。
  - 配置存 `external-source.ts`（SecureStore）。
- **逐字歌词**：`lyrics-parse.ts`（core-domain）解析网易云 yrc→words[] / 标准 LRC→行；
  `external-lyrics.ts` 适配器（网易云 search+lyric/new、LrcAPI /lyrics）；
  `loadLyricSheet` 接入：本地缓存 > 飞牛 > 外部，按 LyricTier（逐字>行>纯文）择优。
  App 早已内置逐字渲染，有 yrc 就卡拉OK、没就整行高亮。
- 待办：音乐信息源适配器（专辑曲目/艺人作品）+ 完整度视图 UI；QQ qrc（加密）暂未做。

## 0.1 一句话目标

把这个 App 从「播放器」升级成「**能养干净、养完整、懂你口味的本地曲库管家**」——
推荐用本地行为画像驱动，元数据靠外部规范源补全，AI 潜移默化地藏在已有功能背后。

---

## 1. 飞牛服务端写回能力（探测结论 + 待办）

设计原则（用户要求）：**按当前能做到的最大程度设计，做不到的留接口，服务端支持后再接。**

### 1.1 已知可写（web 端产物 + 实测确认）

| 能力 | 端点 | 状态 |
|---|---|---|
| 收藏曲目 | `POST /favorite-track/create` \| `/delete` | ✅ 可用 |
| 歌单增删改 | `/playlist/create` \| `edit` \| `delete` \| `add-track` \| `remove-track` | ✅ 可用（member 角色即可） |
| 歌词偏移回写 | `POST /event/report` (`lyric_offset_change`) | ✅ 可用 |
| 触发扫描 | `POST /shared-library/scan`（admin） | ✅ 可用 |
| 播放上报 | `POST /event/report` (`track_play`) | ✅ 可用 |

### 1.2 已重新采集（当前 NAS：fnOS 1.0.10 / mediasrv 0.8.42）

用 `scripts/spike/extract-endpoints.mjs` 抓当前音乐 web bundle（`/music/`，90 个 chunk）得到现行完整端点。

**已确认的写操作（音乐 API）**：
- ✅ **曲目元数据写回**：`POST /track/metadata`（与 GET 读 audioSpec 同路径，方法区分）。
  - 真机抓包确认（2026-09-27），body 为**全量替换**：
    `{guid, title, album(名字串), artistGUIDs[], genreGUIDs[], coverGUID, coverId, discNo, trackNo, year}`
  - `coverGUID` = `coverId` 去掉 `track_`/`album_` 前缀；漏传的字段会被服务端置空。
  - **只需 `authorization` 裸 token，不强制 authx**（空 body 带/不带 authx 都返 `100001`，非 HTML）。
- `shared-library`: `create` / `edit` / `delete` / `scan` / `scan-all` / `reconnect` / `reconnect/check`
- `playlist`: `create` / `edit` / `delete` / `add-track` / `remove-track` / `purge-track`
- `favorite-track`: `create` / `delete` / `purge-track`；`artist`/`genre`: `create`（需 admin）
- `play-history`: `delete`；`search`: `index/rebuild`；`task`: `retry`/`cancel`/`delete`；`user`: CRUD

### 1.3 登录：账号密码仍有效（之前结论作废）

- 音乐同时支持 **OAuth 与账号密码**两种。App 现行的 `password-login` 一直正常（TestFlight 实证），
  **不迁 OAuth**（OAuth 要跳转飞牛授权页/App，体验更差）。
- （之前 curl `password-login` 得 120001 是我少带了某个头，非端点停用。）
- token 获取：从已登录浏览器任一音乐请求的 `authorization` 头拿（或 cookie `music-token`）。

### 1.4 已落地（数据层 + 编辑页 v1）

- ✅ `capabilities.metadataWrite`（core-domain）；飞牛 = `true`。
- ✅ `MusicProvider.updateTrackMetadata?(TrackMetadataUpdate)`（provider-api 契约）+ 飞牛实现 + 单测（body 对齐真机抓包）。
- ✅ 「歌曲信息」页（`app/track-info.tsx`）改为可编辑：名称/专辑/年份/曲目序号/光盘序号，
  保存走 `updateTrackMetadata`（由 `capabilities.metadataWrite` + 完整曲目门控，否则只读）。
  歌手/风格/封面暂保留原值原样写回。

### 1.5 待办（编辑页 v2 + 其他）

- [ ] 歌手 **多选选择器**（`/artist/list-all` 为源，artistGUIDs[]）+ 风格多选（`/genre/list`）。
- [ ] 新增歌手/风格：`POST /artist/create`、`POST /genre/create`（admin；需抓包确认 body）。
- [ ] 换封面：`POST /static/cover/track` 上传（multipart，类似 `/static/cover/playlist`）→ coverId。
- [ ] 专辑/艺人级元数据写回；本地叠加层兜底；其他后端（Emby/Jellyfin/Navidrome）adapter。

权限：新增歌手/风格、换封面需 **admin**（member 只能从现有里选）。当前测试账号 aexachao = admin。

---

## 2. 本地口味画像（Taste Profile）—— 第一步要实现的引擎

### 2.1 为什么不靠「让用户选喜欢的歌手/流派」

库是别人的收藏，用户自己都还不认识这个库，勾不出偏好。→ **观察行为，而非索取选择。**

### 2.2 信号

| 信号 | 权重方向 | 说明 |
|---|---|---|
| 听完整首 | 强正 | |
| 重复播放 / 手动切回 | 强正 | |
| 收藏 | 强正 | |
| **开头 N 秒内跳过** | **强负** | 对「别人的库」最关键：快速剔除不喜欢的类别 |
| 中后段跳过 | 弱负 | |
| 时段 / 连播关系 | 上下文 | 早晚、哪些歌常被一起听 |

### 2.3 模型

- 亲和度向量：`artistAffinity`、`genreAffinity`、`eraAffinity`（年代分桶）。
- 每个事件按权重更新，带**时间衰减**（近期口味权重高）。
- **冷启动先验**：第 0 天用**库成分统计**做先验（库里流派/艺人/年代占比），
  随行为事件累积，从「库先验」平滑过渡到「行为后验」（加权融合，事件越多后验权重越大）。
- 纯逻辑、可单测、无副作用（RNG 可注入以便测试）。

### 2.4 落点

- `packages/core-domain/src/taste-profile.ts`（纯逻辑）
- 事件来源：播放器换歌/结束/跳过 + 收藏动作（已有 occurrence 模型，见 `player/store.ts`）。
- 画像持久化：设备本地（storage 层）。

---

## 3. 本地漫游（替代飞牛的「整库伪随机」）

### 3.1 打分公式

```
score(track) = 画像亲和度(track)
             × 新鲜度(近期没放过的加分)
             × 多样性惩罚(避免连着同一歌手/专辑)
             + 探索噪声(ε 概率塞一首陌生/低亲和的歌)
```

- **加权采样**滚动生成队列（不是取 top-N，避免天天同几首）。
- 探索项的作用：持续扩展口味 + 收集负反馈（用户跳过它 = 学到一条负信号）。
- 可「以某首/某歌手/某流派为种子」漫游：种子的内容相似度 + 连播共现。
- 可选：时段/星期上下文。

### 3.2 落点

- `packages/core-domain/src/roaming.ts`：`buildRoamingQueue(candidates, profile, opts, rng)` 纯函数。
- 候选池由调用方从 provider 拉（分页/采样），引擎只做排序+采样。
- 接到播放器：作为「本地电台」播放源，与飞牛 `radio`（roam-start/next/previous）并存，用户可选。

---

## 4. 专辑/艺人「完整度视图」+ 元数据补全

### 4.1 痛点

现在专辑页只显示「库里有的歌」。用户想看**某艺人的完整作品**，标出哪些入库、哪些缺，
好有目标地补全（因为库是 dump 来的，天然残缺）。

### 4.2 数据源

- **完整作品目录**：MusicBrainz（开放、免费、规范的 release group + 年份，最适合「某艺人所有专辑」）。
- **封面/热度**：Last.fm（已接入）+ Cover Art Archive。
- 两者互补：MusicBrainz 出目录，Last.fm 出图与热度。

### 4.3 功能

- 艺人页新增「完整作品」区：每张专辑标 `已入库 / 部分入库 (3/12) / 未入库`。
- 专辑页显示完整曲目，标出缺哪几首。
- 「补全清单」：汇总缺失项，可导出，供用户按图索骥去找资源。

### 4.4 难点：跨源匹配

名字/罗马音/翻译/VA 合辑差异大。normalize + 模糊匹配（专辑名+艺人+年份；曲目按标题+曲目号）。
→ 这是 AI 可以**默默**帮忙的点（模糊匹配、消歧），而非让用户手动对。

---

## 5. 其它 NAS 听歌痛点（待排期）

按严重度：

1. **元数据脏（头号痛点）**：艺人名不统一/缺失、VA 泛滥、流派乱标、缺年份、专辑名是文件夹名、简繁中英混。
   毁掉一切按标签的功能。→ 整理/归一化（AI 辅助 + 用户确认）。**与第 4 节是一体两面。**
2. **重复曲目**（同歌多格式/多源）→ 去重检测。
3. **合辑/VA 打散艺人视图** → 归并。
4. **不了解自己的库** → 「库速览 / 发现你自己的收藏」。
5. **尘封的歌**（听过一次沉底）→ 定期重新浮现。
6. 封面缺失/错配、歌词缺失（冷门歌）。
7. 曲目号错乱 → 专辑播放顺序错。
8. 脏标签下搜索难（拼写错、罗马音 vs CJK）。

---

## 6. AI 融合：隐形、可降级、用户可关

### 6.1 四条铁律

1. **AI 是能力层，不是功能**：藏在已有功能背后让它们更聪明，不新开「AI 页」。
2. **优雅降级**：每个 AI 增强的功能，AI 关掉时仍能用（退回本地启发式）。AI 永不是硬依赖。
3. **事实来源永远是本地库**：AI 只做编排/排序/匹配/命名，绝不凭空点歌；输出回本地库校验，丢弃幻觉；
   改元数据一律「建议 + 用户确认」，不自动改。
4. **不打扰**：仅用户触发或后台批处理（如夜间整理）时调用；只发元数据不发音频；结果缓存；不阻塞播放。

### 6.2 AI 藏在哪

| 表面功能 | AI 在背后做什么 | AI 关掉时的降级 |
|---|---|---|
| 每日推荐 / 漫游 | 对本地候选重排、挑选、起电台名 | 纯本地打分（第 3 节） |
| 元数据整理 | 归一化脏标签、匹配 MusicBrainz、消歧同名艺人 | 纯字符串规则匹配 |
| 搜索 | 「看起来更懂你」（自然语言→流派/情绪/年代/艺人→回库检索） | 关键词检索（现状） |
| 情绪/场景标签 | 后台给歌打「氛围/场景」标签，支撑自然语言检索 | 无标签 |
| 歌单 | 一句话生成歌单、给电台写简介 | 手动建歌单 |

### 6.3 Provider 配置（OpenAI 兼容）

- 设置里填 `baseURL` + `apiKey` + `模型`，统一走 `POST {baseURL}/chat/completions`。
- 兼容：OpenAI / DeepSeek / 通义千问 / Kimi(Moonshot) / 智谱 GLM / 硅基流动 / 本地 Ollama、LM Studio。
- `apiKey` 存 **Keychain**（复用现有安全存储层）；`baseURL` 强制 https 校验，防止把 key 发到恶意端点。
- 结构化输出（JSON schema）+ 回库校验；AI 输出一律当**不可信数据**处理。

### 6.4 设置模型

- 一个「智能功能」分区：Provider 配置 + 一组**按能力开关**，**默认开**（前提配了 provider）。
- 没配 provider 时，这些功能**静默退回本地启发式**，不报错不打扰。
- 用户随时可逐项关闭 —— 默认智能、但控制权在用户。

---

## 7. 落地顺序（Roadmap）

- [ ] **① 本地画像 + 漫游引擎**（纯逻辑 + 单测，先不碰 UI）← **进行中**
  - [x] `taste-profile.ts`：模型 + 事件更新 + 衰减 + 库先验 + `scoreTrack` + `libraryCompositionOf` + `classifyPlaybackOutcome`
  - [x] `roaming.ts`：`buildRoamingQueue`（亲和×新鲜×多样 + 探索，可注入 RNG）
  - [x] 单测覆盖
  - [x] 接入：事件采集（收藏/取消 + 听完/开头跳/中途跳，在 bridge 的换歌/队列结束事件）
  - [x] 画像持久化（`taste-profile-store`，按 serverId，SecureStore）
  - [x] 「本地电台/猜你喜欢」播放源（`local-radio.ts`）+ 首页「随心漫游」改走本地引擎（失败退回飞牛 roam）
  - [ ] 调优：探索 ε / 衰减半衰期 / 跳过判定阀值（上线后按体感）；独立「猜你喜欢」入口与可视化

#### 超参调优（已建立离线验证）

真正调优需线上行为数据；当前用**合成场景**（`recommend-simulation.test.ts`）验证默认超参产生预期动态：
- 收敛：训练后偏好类占前 10 的 > 80%
- 探索：默认 ε=0.15 下，>40% 的队列仍露出反感类（能改口味/收负反馈）
- 多样：同歌手平均每条队列连续 < 1 次
- 冷启动：零训练时 like/dislike 大致各半

旋钮集中处：`ROAMING_DEFAULTS`（ε/温度/新鲜/多样惩罚）、`SIGNAL_WEIGHTS`、`DIMENSION_WEIGHTS`、
`DEFAULT_HALF_LIFE_MS`、`BLEND_PRIOR_K`、`SKIP_EARLY_MS`。结论：默认值已通过验证，不盲改；
任何调整都要先跟仿真护栏跑绿，再等真实数据微调。
- [ ] **② 完整度视图 + 元数据匹配**（MusicBrainz 接入 + 本地匹配 + 完整度/缺口展示）
  - [ ] 先做**只读**完整度/缺口展示（不改库）
  - [ ] `MetadataWriteback` port + `capabilities.metadataWrite`（飞牛 no-op，未来后端接实现）
- [ ] **③ AI 能力层**（OpenAI 兼容客户端 + Keychain + 设置开关）
  - [ ] 先接两个最出彩且最安全的点：**推荐重排** + **自然语言搜索**
- [ ] **④ 元数据整理、场景标签、去重、库速览** 等（按第 5 节排期）

---

## 8. 待确认 / 待探测清单

- [ ] 跑 `probe-writeback.mjs`，回填第 1.2 节 —— 确认飞牛写回边界。
- [ ] 元数据整理写回深度：只读叠加层 vs 库级写回（取决于探测结果）。
- [ ] 探索项 ε、时间衰减半衰期、跳过判定的 N 秒 —— 这些超参上线后按体感调。
