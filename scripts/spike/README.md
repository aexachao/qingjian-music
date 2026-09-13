# scripts/spike —— 转码产物缓存方案的验证工具

验证目标：证实「把服务端转码的 HLS 产物拼接成单文件缓存下来」这条路可行 —— 用纯 JS 解决
「NAS 每次播放都重复转码」与「不可播格式没有离线」两个问题，不引入 FFmpeg。
协议细节（会话、播放列表、分片命名、已知行为）见 [`docs/fnos-transcode.md`](../../docs/fnos-transcode.md)。

| 文件 | 作用 |
| --- | --- |
| `list-formats.ts` | 列出音乐库里的格式分布，并给出可直接使用的测试 guid |
| `transcode-concat.ts` | `local` 模式验证拼接机制；`remote` 模式对真实服务器走完整流程 |
| `verify-avfoundation.swift` | 用 AVFoundation（iOS 上 RNTP 的真实播放框架）判断可播性 + 完整解码 |

这些是 spike 工具，不是生产代码。

---

## 0. 先拿 token

飞牛的 token 靠 `POST /user/password-login` 换，密码字段是 **sha256 十六进制**：

```bash
BASE=http://192.168.2.100:5666
HASH=$(printf '%s' '你的密码' | shasum -a 256 | cut -d' ' -f1)

curl -s -X POST "$BASE/music/api/v1/user/password-login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"你的用户名\",\"password\":\"$HASH\",\"deviceId\":\"spike\"}" \
  | python3 -m json.tool
# 取返回里 data.userToken 作为 FNOS_TOKEN
```

```bash
export FNOS_BASE=http://192.168.2.100:5666
export FNOS_TOKEN='粘贴 userToken'
```

> `deviceId` 填任意字符串即可。token 失效后没有 refresh 接口，重跑一次上面的命令就行。

---

## 1. 先看清你库里到底有什么

**不要手工找样本。** 这个脚本会扫全库、按格式聚合，并直接打印可复制的验证命令：

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/spike/list-formats.ts
```

输出形如：

```
格式       数量    占比      需转码  示例
──────────────────────────────────────────────────────────────────────────
flac         812   68.4%   否      ...
mp3          301   25.4%   否      ...
wma           58    4.9%   是      ...
ape           12    1.0%   是      ...
dsf            3    0.3%   是      ...

需要服务端转码的格式（按数量排序）：
  wma       58 首   codec=wmav2 ch=2 44100Hz 6.2MB
  ...
  合计 73 首，占 6.2%

可以直接跑转码验证的样本（每格式取一首）：
FNOS_BASE=$FNOS_BASE FNOS_TOKEN=$FNOS_TOKEN node scripts/spike/transcode-concat.ts remote <guid> /tmp/qj-spike/real-wma.mp4
```

它同时回答了两个问题：**你库里有哪些格式**（这也补上了「真实格式分布」这个待确认项），以及**该拿哪几首测**。

---

## 2. 要准备哪些格式的样本

判定依据是 `apps/mobile/src/player/format-support.ts` 的白名单 —— **不在白名单里的一律走转码**。

### 必须测（P0）

| 后缀 | 为什么要测 | 建议 |
| --- | --- | --- |
| `wma` | 实测占你曲库约 5%，是**主要场景** | **三种子类型各来一个**：WMA Standard / WMA Pro / WMA Lossless。FFmpeg 的解码器不同（`wmav2` / `wmapro` / `wmalossless`），服务端支持情况可能不一样 |
| `ape` | Monkey's Audio，无损，发烧资源常见 | 一个即可 |
| `dsf` | DSD 的 Sony 容器，**最坏情况**（体积大、解码重） | **只放短样本**（1–2 分钟），DSD64 一分钟就有 40MB |
| `dff` | DSD 的 Philips 容器，与 `dsf` 是两个不同解析路径 | 同上 |
| `wv` | WavPack，无损 | 一个即可 |

### 值得测（P1）

| 后缀 | 为什么要测 |
| --- | --- |
| `tak` / `tta` | 少见格式，确认服务端 FFmpeg 是否支持（不支持会返回 `status:'failed'`） |
| `cue` + 整轨 | 整轨镜像（通常配 `ape`/`flac`/`wav`）。CUE 在 web 端是**一律转码**的，且需要切段，值得单独验 |
| **多声道 `flac`（5.1）** | ⚠️ **潜在缺口**：我们的 `needsTranscode()` 只看格式、不看声道数，所以 5.1 FLAC 会走直推。web 端的判定里「源声道 > 设备声道」是要转码的。真机放不出来时会靠 `PlaybackError` 兜底自愈，但会多一次失败往返 —— 值得确认 |

### 对照组（确认正常路径没被改坏）

`flac` / `mp3` / `m4a` / `wav` / `aiff` 各一首。这些**不应该**触发转码。

### 时长要求（重要）

- 大部分样本用 **30–60 秒**即可，下载快、迭代快。
- **至少放一首完整长度（4–5 分钟）的 `wma`** —— 心跳相关的坑只有长下载才会暴露（见 §4）。

### 放进服务器之后

文件拷进媒体库目录后，如果 `/track/list` 里看不到，需要触发一次扫描：

```
POST /music/api/v1/shared-library/scan        （需要管理员权限）
```

> ⚠️ 这个路径来自 `docs/fnos-music-api.md` 的 recon 记录，**未实测**；App 目前只用了
> `/shared-library/list`。如果它不生效，走飞牛 Web 端的「扫描媒体库」按钮即可。

扫完用 §1 的脚本确认新格式已经出现。

---

## 3. 跑验证

```bash
# 本地机制验证：不需要服务器，用 ffmpeg 造一份同形状样本
ffmpeg -f lavfi -i "sine=frequency=440:duration=30" -f lavfi -i "sine=frequency=660:duration=30" \
  -filter_complex "[0:a][1:a]amerge=inputs=2[a]" -map "[a]" \
  -c:a flac -ar 44100 -ac 2 \
  -f hls -hls_segment_type fmp4 -hls_time 2 -hls_list_size 0 -hls_playlist_type vod \
  -hls_fmp4_init_filename init.mp4 -hls_segment_filename "seg%d.m4s" /tmp/qj-spike/hls/preset.m3u8

node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/spike/transcode-concat.ts local /tmp/qj-spike/hls /tmp/qj-spike/out/joined.mp4
swift scripts/spike/verify-avfoundation.swift /tmp/qj-spike/out/joined.mp4 30.104

# 真实服务器验证（guid 从 §1 的脚本里拿）
FNOS_BASE=$FNOS_BASE FNOS_TOKEN=$FNOS_TOKEN \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/spike/transcode-concat.ts remote <guid> /tmp/qj-spike/real-wma.mp4
swift scripts/spike/verify-avfoundation.swift /tmp/qj-spike/real-wma.mp4 <播放列表总时长>
```

`local` 模式还带两个**负面对照**，用来确认验证方法本身有效（一个永远通过的验证等于没有验证）：

```bash
node … local /tmp/qj-spike/hls /tmp/out/broken-noinit.mp4 --no-init   # 漏掉 init.mp4
node … local /tmp/qj-spike/hls /tmp/out/broken-reverse.mp4 --reverse  # 分片倒序
```

---

## 4. 判定标准

| 检查 | 通过 | 失败 |
| --- | --- | --- |
| 转码 POST | `status` = `success` / `ready` | `failed`（服务端不支持该格式） |
| 播放列表 | 200 + 有分片 | 401（token）/ 404/410（见坑 1、2） |
| **分片计数（主判据）** | `moof` 数 == `mdat` 数 == 播放列表分片数 | 不一致 = 丢片/重复 |
| 产物顶层 box | `ftyp` 在偏移 0 | 不以 `ftyp` 开头 |
| `isPlayable` | true | false |
| 时长（辅助判据，查顺序） | 与源时长偏差在容差内（实测正常为 -0.004s） | 偏差很大 = 顺序错/静默损坏 |
| AVAssetReader | `completed` 且帧数 ≈ 时长 × 采样率 | failed / 0 帧 |

### 已知的坑（都是对真实服务器实测踩出来的）

1. **分片可能"还没生成"，要重试。** `POST /track/transcode` 返回 `status:'success'` **只代表任务已建**，分片仍可能要等一会儿才可下载 —— 此时请求分片会拿到 **404**，而且现象很迷惑：播放列表能取到、`init.mp4` 也能取到，就是首个分片 404。**源越重越容易踩到**：实测 `wma`（7MB）几乎不失败，`dsf`（DSD256，314MB）稳定复现，等约 2 秒后即全部 200。
   区分：**404 = 还没生成（可重试）**；**410 = 任务被回收（要重开会话）**。`transcode-concat.ts` 已实现有界重试。
2. **下载期间必须持续发心跳**（每 10 秒）。服务端按心跳判活，断掉约 1 分钟后任务被回收、分片开始返回 **410**。一首 4 分钟曲目约 30MB / 120 个分片，足够踩到。
3. **产物后缀必须是 `.mp4`**，绝不能沿用源格式后缀。实测：`.mp4`/`.m4a`/`.mov` 可播，而 `.wma`/`.ape`/`.dsf`/`.dff`/`.wv`/`.tak`/`.tta` **全部 `isPlayable = false`** —— 这组后缀恰好就是需要转码的那组格式。
4. **完整性判据用「分片计数」，不要用时长。** 每个媒体分片 = 一个 `moof` + 一个 `mdat`，所以 `moof 数 == 播放列表分片数` 是精确判据。原因有两面：
   - 时长会**误报失败**：服务端对某些源会重采样到非整数比的目标采样率，产物时长会比源短约 1%（实测 `dsf`：DSD256 → 384kHz，短 1.65 秒），这不是拼接错误；
   - 时长会**漏报丢片**：漏一个 2 秒分片在 4 分钟曲目里只占 0.8%，宽松阈值抓不住，而 `moof` 计数一抓一个准。
5. **顺序错误只能靠时长/播放验证兜住。** 分片倒序时 AVFoundation 仍然报 `isPlayable = true`、仍能解出音频，只是时长从 30s 静默变成 2s。所以 `moof` 计数（查丢片/重复）**和**时长比对（查顺序）两个都要做，缺一不可。

---

## 6. 实测结果（2026-09-13，真实服务器 192.168.2.100）

库内共 41198 首，其中需要转码的占约 **7.6%**：

| 格式 | 数量 | codec / 规格 | 转码结果 |
| --- | --- | --- | --- |
| `flac` | 29561 | — | 原生可播 |
| `wav` | 6356 | — | 原生可播 |
| **`wma`** | **2952** | wmav2, 2ch, 44.1kHz | ✅ 5s / 23MB |
| `mp3` | 1043 | — | 原生可播 |
| **`dts`** | **146** | dts, **6ch**, 48kHz | ✅ 6s / 44MB |
| **`dff`** | **24** | dsd_msbf, 352.8kHz | ✅ 10s / 273MB |
| **`dsf`** | **13** | dsd_lsbf_planar, 705.6kHz | ✅ 16s / 203MB（见下方注） |
| `m4a` / `aiff` | 26 | — | 原生可播 |
| **`ape`** | **1** | ape, 2ch | ✅ 5s / 18MB |
| **`tta`** | **1** | tta, 2ch（测试样本） | ✅ 31 片 / 60.0s |
| **`flac` 6ch** | **1** | flac, **6ch / 5.1**（测试样本） | ✅ 31 片 / 60.1s，**产物保持 6 声道** |
| **`cue` 整轨** | **3 轨** | flac 整轨 + cue（测试样本） | ✅ 30 片 / 60.08s（**正确切出第 1 轨的 60 秒**） |

全部通过 AVFoundation 验证（`isPlayable = true` + 完整解码 + `moof` 计数与播放列表一致）。

**两个值得记的结论**：

1. **CUE 整轨可用**：`整轨 flac + 同名 cue` 被正确识别成 3 个 CUE 轨道（`isCue = true`，都指向同一个文件），
   且服务端转码能**按 guid 正确切出单轨的时间范围**（170 秒整轨里切出第 1 轨的 60 秒）。
2. **多声道不会被服务端降混**：6 声道 FLAC 的转码产物**仍是 6 声道**。
   也就是说，如果原生直推 5.1 在某些设备上失败，**回落转码这条路是通的**。
   至于原生直推到底行不行 —— AVPlayer / ExoPlayer 一般能自动降混到当前输出路由，
   倾向于是可行的，但**需要真机确认**；在没有证据之前**不要**为了多声道去强制转码
   （那会让 5.1 专辑每次都白转一遍）。

> ⚠️ **`wv`（WavPack）样本没有被索引**：文件已放进媒体库目录，但 `/track/list` 里查不到，
> 全库格式分布里也没有 `wv` 条目。`tta`（同样冷门）能被索引，所以更像**服务端扫描器不支持
> `.wv` 扩展名**，而不是文件没放进去。待确认：先看文件是否真的在目录里，再决定是否跳过这个格式。

> **`dsf` 的一个服务端特性**：该曲目源为 DSD256（705600Hz），服务端把它重采样成 **384000Hz**（非整数比 1.8375），产物时长 232.1s 而源为 233.7s（**短 1.65 秒**），且容器时长元数据（232.1）与可解码音频（231.05）不一致、末尾有时间戳跳变（230.997 → 232.000）。
> **这不是拼接引入的**：产物的 `moof` 数为 117，与播放列表的 117 片完全一致，说明一片不漏、顺序正确。
> 同一份数据在 App 里走 HLS 直接播放时也会有同样的表现，属于服务端转码的既有行为，建议单独跟进。

### 需要准备的样本（`~/Downloads/qj-spike-samples/`，已用 ffmpeg 生成）

> ⚠️ 样本放在 **`~/Downloads/qj-spike-samples/`**（Finder 可见）。
> 不要放 `/tmp` —— macOS 的 `/tmp` 是 `/private/tmp` 的软链，**Finder 里默认看不到**，
> 而且会被系统定期清理。

库里**没有**这几种，需要用真实样本补齐。已生成（源用的是库里真实音乐的转码产物）：

| 文件 | 规格 | 覆盖的点 |
| --- | --- | --- |
| `ZZ-SPIKE-TEST-wavpack.wv` | WavPack, 2ch, 60s, 4.8MB | 白名单外格式 |
| `ZZ-SPIKE-TEST-trueaudio.tta` | TTA, 2ch, 60s, 4.2MB | 白名单外格式 |
| `ZZ-SPIKE-TEST-51-multichannel.flac` | FLAC, **6ch / 5.1**, 60s, 4.6MB | ⚠️ **潜在缺口**：`needsTranscode()` 只看格式不看声道数，5.1 FLAC 会走直推 |
| `ZZ-SPIKE-TEST-wholedisc.flac` + `.cue` | FLAC 整轨, 2ch, 170s, 12MB | CUE 整轨（`isCue` 路径，web 端一律转码） |

复现命令（`SRC` 换成任意音频）：

```bash
ffmpeg -i "$SRC" -t 60 -c:a wavpack ZZ-SPIKE-TEST-wavpack.wv
ffmpeg -i "$SRC" -t 60 -c:a tta     ZZ-SPIKE-TEST-trueaudio.tta
ffmpeg -i "$SRC" -t 60 -ac 6 -c:a flac ZZ-SPIKE-TEST-51-multichannel.flac
ffmpeg -i "$SRC" -t 180 -c:a flac   ZZ-SPIKE-TEST-wholedisc.flac   # 再手写同名 .cue
```

**`tak` 造不出来**：FFmpeg 只有 `tak` 解码器、**没有编码器**，全世界几乎没有开源的 TAK 编码实现。我在小雅的音乐区遍历了约 430 个目录也没找到 `.tak`。建议**跳过** —— 它是极罕见格式，且服务端若不支持会返回 `status:'failed'`，届时按「转码失败」处理即可。

WMA Pro / WMA Lossless 同理（FFmpeg 只有解码器），库里现有的 2830 首全是 `wmav2`（Standard）。

---

## 5. 环境说明

- **`ffmpeg` / `ffprobe` 在 `/opt/homebrew/bin/`** —— `command -v ffmpeg` 会说找不到，那是 PATH 问题，不是没装。
- **Node 22.22 可以直接跑 `.ts`**（类型擦除），但 import 必须写全 `.ts` 后缀。
- 上面的命令都带了 `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`，只是为了压掉噪音警告，不加也能跑。
