# 飞牛音乐（fnOS Music）Web 端转码播放（Transcode / HLS）逆向分析

> **性质**：只读静态逆向。全部结论来自已缓存的前端 bundle，**没有发起任何网络请求**，也没有改动任何源码。
> **素材**：`/Users/chrisli/Documents/dev/qingjian-music/.cache/webui/*.js`（Vite/Rolldown 产物，变量名已混淆）。
> **偏移**：文中 `@数字` 为该缓存文件的**字节偏移**，便于用 `python3 -c` 或编辑器跳转复核。片段均为原文逐字节摘录（≤200 字符）。

## 0. 文件别名与定位方法

| 别名 | 文件 | 内容 |
|---|---|---|
| **A** | `1bc04b5291c26a46d918139138b992d2-uPVOgwab.js` (1.6 MB) | 播放引擎 AudioEngine、NativeStrategy(hls.js)、转码编排、直连/转码判定 |
| **B** | `bdf49c3c3882102fc017ffb661108c63-DxzHiN_b.js` (414 KB) | API 客户端、路由表、鉴权与 `authx` 签名、SparkMD5、sleep |
| **C** | `b718f1354f7247312eca086d9a024afe-SiPo1ec7.js` (393 KB) | 领域模型、`audioSpec` 归一化、i18n key |

A 通过 ESM import 从 B/C 拉入符号，混淆名对应关系（A 头部 import 语句 `@2996–6300`）：

```js
Kt -> B:fi = sleep      $n -> B:w = API client
de -> B:E  = baseUrl()  Li -> C:xt = i18n messages
```

复核用的一次性脚本模板（不写入仓库）：

```bash
python3 - <<'PY'
s=open('/Users/chrisli/Documents/dev/qingjian-music/.cache/webui/1bc04b5291c26a46d918139138b992d2-uPVOgwab.js',encoding='utf-8').read()
i=s.find('async function bh(')   # 换成任意关键字
print(i, s[i:i+600])
PY
```

---

## 1. 结论速查表

### 1.1 端点与基址

| 项 | 值 | 出处 |
|---|---|---|
| 基址 | `<origin>/music/api/v1` | B `var fl=`/music`` @187914；`zy=fl,By=`${zy}/api/v1`` @390022 |
| 开始转码 | `POST /music/api/v1/track/transcode` | B @199470 |
| 心跳 | `POST /music/api/v1/track/transcode/heartbeat` | B @199470 |
| 结束 | `POST /music/api/v1/track/transcode/quit` | B @199470 |
| HLS 播放列表 | `GET /music/api/v1/track/hls/<guid>/preset.m3u8` | A `function ph` @622674 |
| 直连原始流 | `GET /music/api/v1/track/stream?guid=<guid>` | A `function fh` @622600 |
| 元数据 | `GET /music/api/v1/track/metadata?guid=<guid>` | B @199318；A `qm` @620406 |

`hlsPreset` 只出现在**路径常量表**里，**没有**被注册成 API 方法（`Fu` 里没有它），所以 m3u8 的 URL 是 `ph()` 手拼的，不走 API 客户端、不带签名。

### 1.2 请求体 / 响应体

| 端点 | 请求体（Web 端实际发出的全部字段） | 客户端读取的响应字段 |
|---|---|---|
| `/track/transcode` | `{ guid: string, output: { codec: "flac", bitrate: 128\|256\|320, channel: 1\|2\|N } }` | `status`（`"success"`/`"ready"` 视为成功；`"failed"` 报错）、`errmsg`、`errno` |
| `/track/transcode/heartbeat` | `{ guid: string, timestamp: number }` — timestamp = **播放位置秒数**，3 位小数 | 不读（只判 HTTP/envelope 成功） |
| `/track/transcode/quit` | `{ guid: string }` | 不读 |

**output 里没有** `sampleRate` / `bitDepth` / `format` / `container`——Web 端从不发送这些字段。

### 1.3 音质档位

只有一个映射函数 `$l`，三档：

| `quality` 入参 | output.codec | output.bitrate |
|---|---|---|
| `"128"` | `flac` | 128 |
| `"256"` | `flac` | 256 |
| 其它（含 `"original"`） | `flac` | 320 |

Web 端**唯一实际传入的值**是 `qc.defaultAudioQuality = "original"` → 永远命中 default 分支 → `{codec:"flac", bitrate:320}`。
bundle 内**不存在**音质选择 UI（全文无 `audioQuality` 键、无 CJK "音质" 字符串），所以 128/256 是给其它调用方/其它端预留的。

### 1.4 时间常量与重试上限

| 常量 | 值 | 含义 | 出处 |
|---|---|---|---|
| `sh` | `2e4` = 20 s | transcode POST 的 `AbortSignal.timeout` | A @621955 |
| `ch` | `3e3` = 3 s | heartbeat / quit 的 `AbortSignal.timeout` | A @621955 |
| `Kt(50)` | 50 ms | POST 返回后、校验 status 前的固定等待 | A @624362 + B `pt` @36968 |
| `heartbeatIntervalMs` | `1e4` = 10 s | 转码会话心跳间隔（固定字面量） | A `xh` @624803 |
| 引擎心跳兜底 | `3e4` = 30 s | 会话未声明间隔时才用 | A @990265 |
| `MAX_HLS_RETRIES` | 3 | hls.js 层网络/资源/媒体错误重试 | A @291388 |
| `MAX_MEDIA_RECOVERY` | 3 | `recoverMediaError()` 次数 | A @291895 |
| `MAX_HLS_REBUILD_ATTEMPTS` | 2 | 上层"重新解析播放源"（= 重新 POST transcode）次数 | A @970063 |
| HLS 首帧超时 | `3e4` = 30 s | `readyState===0` 判超时 | A @310985 内 |
| task-rebuilt 换 playlist 超时 | `1e4` = 10 s | 等新 manifest | A @317637 |
| `fullDownloadSizeLimitBytes` | `100*1024*1024` | WASM 全量下载上限 | A `qc` @262296 |

**没有任何轮询循环**：`bh()` 只 POST 一次。

### 1.5 直连 vs 转码（一句话规则）

> 满足 **①上层未强制转码** 且 **②本地能放**（浏览器原生解码 OR 客户端 WASM 解码）→ 直连 `/track/stream`；否则 → `POST /track/transcode` + HLS。

### 1.6 鉴权（重要修正）

**bundle 全文没有 `Authorization`，也没有 `Bearer`**（我对 9 个 js 全文搜过，0 命中）。Web 端鉴权是：

1. **Cookie `music-token`**（同源自动携带；`credentials:"include"`）；
2. **`authx` 签名头**——只加在**走 API 客户端的 JSON 请求**上（transcode / heartbeat / quit / metadata 都算）；
3. m3u8 / ts 分片 / `/track/stream`：**只靠同源 Cookie**，无自定义头、无 query token、无签名。

---

## 2. 完整时序

```
PlayerProvider.Pv(track)                              A@656623
  quality = qc.defaultAudioQuality = "original"
  └─ Dh.resolveTrackPlayback                          A@626xxx
       ├─ Pm(track)  本地 OPFS 调试音频命中则直接返回   A@617946
       └─ Eh.resolveTrackPlayback                     A@625701
            1. Jl(track)      取 playbackHints → trackId / isCue / formatHint
            2. yh(trackId)    GET /track/metadata?guid=…（单飞去重）  A@624276
            3. gh(meta,hint)  推导真实源格式 sourceFormat            A@622976
            4. th()           探测设备最大声道数 deviceMaxChannels     A@621010
            5. Sh()           算 outputChannels                      A@625134
            6. _h()           组装 trackPatch / metadata             A@623250
            7. 判定：!wh(ctx) && oh({...})
                 ├─ true  → 直连： Yl({url: fh(guid), transport:"range"})，session = null
                 └─ false → 转码： bh(guid,{quality,channel})  ← POST /track/transcode
                                   Xl({url: ph(guid), sessionKind:"standard"})
                                   session = xh(guid)   ← 心跳 + quit 闭包
  AudioEngine.loadResolvedSource
    pendingPlaybackSession = session
    NativeStrategy.loadSource  → delivery.kind==="hls" → loadWithHls(m3u8)   A@310985
    player.load() resolve 后：pendingPlaybackSession → activePlaybackSession
                              startPlaybackHeartbeat()  每 10 s POST heartbeat
  切歌 / stop / 队列清空 / destroy → disposePlaybackSession() → session.dispose() → POST quit
```

---

## 3. 逐条证据

### 3.1 `POST /track/transcode` 请求体 ✅确证

**A @624362**（关键字 `async function bh(`）：

```js
async function bh(e,t){let n={...$l(t.quality),channel:t.channel},r=await $n.track.transcode({guid:e,output:n}
```

**A @283856**（关键字 `function $l(e){switch(e)`）：

```js
function $l(e){switch(e){case`128`:return{codec:`flac`,bitrate:128};case`256`:return{codec:`flac`,bitrate:256};default:return{codec:`flac`,bitrate:320}}}
```

POST 时 body = 第一个参数（GET 才转 query）——**B @394694**（关键字 `function xb(`）：

```js
function xb(e,t,n){return e.method===`GET`?{...n??{},params:t}:{...n??{},data:t}}
```

方法为 POST——**B @199470**（关键字 `transcode:{method:`）：

```js
transcode:{method:`POST`,path:q.track.transcode},transcodeHeartbeat:{method:`POST`,path:q.track.transcodeHeartbeat},transcodeQuit:{method:`POST`,path:q.track.transcodeQuit}
```

#### output 字段表

| 字段 | 类型 | 取值 | 来源 |
|---|---|---|---|
| `codec` | string | 恒为 `"flac"` | `$l()` 三个分支都是 `flac` |
| `bitrate` | number | `128` / `256` / `320` | `$l(quality)`；Web 实际只发 320 |
| `channel` | number | `$m(sourceChannels, deviceMaxChannels)` 的结果，实测常见 1 / 2 / 源声道数 | `bh` 的 `t.channel` ← `c.outputChannels` |

`channel` 的计算——**A @625134 / @620745 / @621010 / @290406**：

```js
function Sh(e,t){let n=Qm(t)??2,r=Qm(e);return{deviceMaxChannels:n,sourceChannels:r,outputChannels:$m(r,n)}}
```

```js
function $m(e,t){let n=Qm(t)??2,r=Qm(e);return r?r<=n?r:n<=1?1:2:Math.min(n,2)}
```

翻译成人话（`e`=源声道数 `audioSpec.channel`，`t`=设备最大声道数）：

* 源声道数已知且 ≤ 设备最大 → **原样透传**（6 声道设备支持 8 → 发 6）；
* 源声道数已知但 > 设备最大 → 设备 ≤1 声道发 **1**，否则发 **2**（不发 4/6，直接降到立体声）；
* 源声道数未知 → `min(设备最大, 2)`。

设备最大声道数（`th()`，带缓存 + `devicechange` 失效）：

```js
async function th(){return Jm===null?Ym||(Ym=(async()=>{if(eh(),bu())return Jm=2,Ym=null,Jm;
```

`bu()` = Safari/纯 WebKit 判定，命中就**直接固定 2**，不去 new AudioContext 探测：

```js
bu=()=>{if(typeof navigator>`u`)return!1;let e=navigator.userAgent;return/AppleWebKit/i.test(e)&&!/(Android|Chrome|Chromium|CriOS|Edg|EdgiOS|FxiOS|OPR|OPiOS)/i.test(e)}
```

否则取 `new AudioContext().destination.maxChannelCount`，失败回落 2。

#### 请求头 ✅确证

| 头 | 值 | 出处 |
|---|---|---|
| `Content-Type` | `application/json` | B `lb` @392115 |
| `Accept-Language` | 当前 locale（有则加） | B `lb` @392115 |
| `authx` | `nonce=…&timestamp=…&sign=…` | B @389975 |
| Cookie | `music-token=<token>`（`credentials:"include"`） | B `rb` @391057、`db` @392310 |

详见 §4。

### 3.2 `POST /track/transcode` 响应体与状态机 ✅确证

**A @624362 续**（关键字 `Transcode response missing status`）：

```js
if(await Kt(50),!r?.status)throw Error(`Transcode response missing status`);if(r.status===`failed`)throw Error(r.errmsg||r.errno||`Transcode task failed`)
```

```js
if(r.status!==`success`&&r.status!==`ready`)throw Error(`Transcode not ready: ${r.status}`)
```

这里的 `r` 已经是**解包后的 `data`**——B `rd` @208803（关键字 `return e.data??null`）：外层信封是 `{code, msg, data}`，`code ∈ {0,200}` 才算成功（B `Vu=[0,200]` @201073、`Uu=e=>Vu.includes(e)` @202486），否则抛 `ApiError`。

#### status 取值

| 值 | 客户端行为 | 是否代码直读 |
|---|---|---|
| `"success"` | 通过，继续加载 m3u8 | ✅ |
| `"ready"` | 通过，继续加载 m3u8 | ✅ |
| `"failed"` | 抛 `Error(errmsg \|\| errno \|\| "Transcode task failed")` | ✅ |
| 其它任意值 | 抛 `Error("Transcode not ready: <status>")`——**当致命错误处理，不重试、不轮询** | ✅ |
| 缺失/空 | 抛 `Error("Transcode response missing status")` | ✅ |

我全文搜过 ``pending`` / ``processing`` / ``queued`` 三个字面量：`processing` 与 `queued` **0 命中**；`pending` 的 49 处命中全部与 React/加载态无关。也就是说 **Web 端并不认识"排队中/处理中"这类状态**。

#### 轮询？超时？重试？

* **无轮询**：`bh()` 里没有 `for`/`while`/递归，只有一次 POST 和一次 `Kt(50)`。
* `await Kt(50)` = **固定 50 毫秒**（B `function pt(e){return new Promise(t=>{setTimeout(()=>{t()},e)})}` @36968）。位置在 POST **之后**、校验 status **之前**，是给服务端写 playlist 留的固定缓冲，不是轮询间隔。
* **单次请求超时 20 s**：`signal:dh(t.signal,uh(sh))`，`sh=2e4`。`uh` 优先用 `AbortSignal.timeout`，降级 `AbortController+setTimeout`；`dh` 用 `AbortSignal.any` 合并调用方 signal：

```js
function uh(e){if(typeof AbortSignal<`u`&&typeof AbortSignal.timeout==`function`)return AbortSignal.timeout(e)
```

* **重试发生在上一层**，且不是"重试 transcode 接口"，而是"重新走一遍解析流程"（因此会重新 POST transcode），上限 **2 次**：

```js
async handleHlsTaskExpired(){let t=this.store.getState(),n=t.currentTrack;
```

```js
this.hlsRebuildTrackId===r?this.hlsRebuildAttempts++:(this.hlsRebuildTrackId=r,this.hlsRebuildAttempts=1),this.hlsRebuildAttempts>e.MAX_HLS_REBUILD_ATTEMPTS
```

超限后：`disposePlaybackSession()` → 弹"播放恢复失败，即将跳到下一首" → 1500 ms 后跳下一首。
未超限时：`await this.disposePlaybackSessionAndWait(), await this.reloadCurrentTrack(n,a,i,{disposeExistingSession:!1})`——**先等旧任务 quit 完成，再重新解析（重新 POST transcode），并恢复原播放进度**。

### 3.3 心跳 ✅确证

**A @624803**（关键字 `heartbeatIntervalMs`）：

```js
function xh(e){return{heartbeatIntervalMs:1e4,heartbeat:async t=>{await $n.track.transcodeHeartbeat({guid:e,timestamp:t}
```

#### timestamp 的单位与语义 = **播放位置（秒，3 位小数），不是墙上时间**

**A @991018**（关键字 `getHeartbeatTime`）：

```js
getHeartbeatTime(e){let t=Number((Number.isFinite(e)?Math.max(0,e):0).toFixed(3));if(this.lastHeartbeatTime===null||t>this.lastHeartbeatTime)return this.lastHeartbeatTime=t,t
```

调用处（**A @990640**）传的就是播放器当前时间：

```js
let t=this.getHeartbeatTime(this.store.getState().currentTime);try{await this.activePlaybackSession.heartbeat(t)}catch(e){console.warn(`[AudioEngine] Playback heartbeat failed:`,e)}
```

要点：

* 单位 **秒**，`toFixed(3)` → 毫秒精度小数，例如 `73.482`；
* `Math.max(0, …)`，非有限值取 0；
* **强制单调递增**：若本次值不大于上次，则用 `上次 + 0.001`。所以服务端看到的 timestamp 永远严格递增，即使暂停不动；
* 它**不是** `Date.now()`，也不是 Unix 时间戳。

#### 间隔 10 s 是否可变？

不可变。`1e4` 是 `xh()` 里的**字面量**，无配置项、无自适应。引擎侧只是"会话没给就用 30 s"：

```js
let e=this.activePlaybackSession.heartbeatIntervalMs??3e4;this.lastHeartbeatTime=null,this.heartbeatTimer=setInterval(()=>{this.sendPlaybackHeartbeat()},e)
```

#### 启动 / 停止条件

| 事件 | 心跳 |
|---|---|
| `player.load()` 成功、session 从 pending 升为 active | **启动**（`startPlaybackHeartbeat`，A @990265） |
| **暂停** `pause()` | **不停**（A `pause(){…this.player.pause(),…setIsPlaying(!1)}`，没有触碰 heartbeatTimer） |
| 当前曲目 id 与 `activeResolvedTrackId` 不一致 | 该次心跳**静默跳过**（timer 仍在跑） |
| 心跳请求失败 | 只 `console.warn`，**不重试、不退避、不停 timer** |
| `stopPlaybackHeartbeat()` / `takeOwnedPlaybackSessions()` / `detachPlaybackSession()` / `startPlaybackHeartbeat()` 重入 | **停止** |
| 切歌、停止、队列清空、销毁 | 先停心跳再 quit |

心跳请求超时 3 s（`signal:uh(ch)`, `ch=3e3`），**不带**调用方 signal。

### 3.4 退出 `/track/transcode/quit` ✅确证

**A @624803 续**：

```js
dispose:async()=>{await $n.track.transcodeQuit({guid:e},{fallbackMessage:Li.playback.endTranscodeSessionFailed(),signal:uh(ch)})}
```

请求体**只有 `{guid}`**，超时 3 s。

#### 调用时机

会 quit（`disposePlaybackSession()` → `disposeSession()` → `session.dispose()`）：

| 场景 | 代码位置 |
|---|---|
| **切歌**（`loadTrackPlaybackInternal` 的 `disposeExistingSession=true`） | A @986605 附近：`n?(this.resetHlsRebuildAttempts(),await this.disposePlaybackSession()):this.detachPlaybackSession()` |
| `stop()` | A：`stop(){this.abortPendingTrackLoad(),…,this.disposePlaybackSession()` |
| 队列被清空 / currentTrack 变 null | A @980384 |
| 单曲 + repeat off 播完、队列末尾 + repeat off | A @977162 / @977375 |
| `destroy()`（Provider 卸载） | A @998859 |
| 跳过失败曲目 / 停止失败的单曲循环 | A @1003416 |
| `loadHiRes()` | A @996598 |
| HLS 重建（先 `disposePlaybackSessionAndWait()` 等 quit 完成） | A @991414 |
| 加载失败时清理 pending 会话 | A @991966 |

**不会** quit：

* `pause()`——**暂停不退出转码任务**；
* `detachPlaybackSession()`（A @992395）——只把引用置空，**故意不 quit**；
* `disposeStaleResolvedSession()` 在会话仍属于当前曲目时**故意保留**：

```js
if(t&&this.store.getState().currentTrack?.id===t){PT(`[AudioEngine] Keeping stale playback session for active track to avoid quitting the current transcode task`)
```

* **关闭标签页 / 刷新 / 崩溃**——bundle 里**没有** `beforeunload`/`pagehide` 触发 quit 的代码。唯一用 `sendBeacon` 的地方是播放历史上报：

```js
av=e=>{if(typeof navigator>`u`||typeof navigator.sendBeacon!=`function`)return!1;let t=JSON.stringify(tv(e));return navigator.sendBeacon(`${de()}/event/report`
```

因此**页面关闭时转码任务只能靠服务端心跳超时回收**。

#### 幂等 / 重试

**没有任何重试或幂等标记**。`disposeSession` 只调一次并吞掉异常：

```js
async disposeSession(e,t){let n=e.dispose;if(n)try{await Promise.resolve(n())}catch(e){console.warn(`[AudioEngine] Failed to dispose ${t}:`,e)}}
```

`disposeSessionInBackground()` 连 `await` 都不做（fire-and-forget）。
另外：若 quit 返回 401 / `code=120001`，会走全局登录过期逻辑——弹提示、`await pt(1e3)`、清 `music-token` cookie、跳 `/login`（B `tb` @390837、`_b`、`Wu=(e,t)=>e===120001||t===401` @202507）。

### 3.5 HLS 播放 ✅确证

#### `preset.m3u8` 是固定字面量

```js
function fh(e){return`${de()}/track/stream?guid=${encodeURIComponent(e)}`}function ph(e){return`${de()}/track/hls/${encodeURIComponent(e)}/preset.m3u8`}
```

* 唯一变量是 `guid`（`encodeURIComponent`）；`preset` **不会被替换成 128/256/320 之类档位**。
* 档位信息只体现在 `POST /track/transcode` 的 `output` 里，播放列表 URL 与档位无关 → 服务端按 (用户会话, guid) 维护当前转码任务。
* 路径常量表里的 `hlsPreset:`/track/hls/:guid/preset.m3u8``（B @193047）与 `ph()` 拼出的完全一致。

#### 鉴权：**没有 Authorization**，只有同源 Cookie

* 全文搜索 `Authorization` / `Bearer`：**0 命中**（9 个 js 全扫）。
* 全 bundle 里被 `set()` 的头只有：`authx`、`Content-Type`/`content-type`、`Accept-Language`、`Location`（路由用）。
* hls.js 实例配置（**A @311541**）——分片/清单请求既不加头也不开 withCredentials：

```js
xhrSetup:(e,t)=>{e.withCredentials=!1,e.addEventListener(`load`,()=>{if(e.getResponseHeader(`X-Task-Rebuilt`)===`true`)
```

* `<audio>` 元素（**A @293810**）：

```js
createAudioElement(){let e=new Audio;return e.crossOrigin=`anonymous`,e.preload=`metadata`,e}
```

结论：m3u8 / ts / `/track/stream` 都是**同源请求**，浏览器按 same-origin 规则自动带上 `music-token` Cookie；`withCredentials=false` 与 `crossOrigin="anonymous"` 在同源场景下**不会阻止 Cookie**（它们只影响跨源）。**没有 query token、没有签名头。**

#### 服务端可主动换 playlist

hls.js 的 `load` 回调检查两个自定义响应头：`X-Task-Rebuilt: true` + `X-New-Playlist-Url: <url>` → 100 ms 后 `handleTaskRebuilt(newUrl)`（**A @317637**）：`hls.loadSource(newUrl)` → 等 `hlsManifestParsed`（10 s 超时）→ 恢复 `currentTime` → 恢复播放。

#### 是否用 hls.js 还是原生 HLS

**A @304588**：

```js
canPlayHlsNatively(){return typeof SharedArrayBuffer<`u`?!1:this.audio.canPlayType(`application/vnd.apple.mpegurl`)!==``}
```

即：**只要存在 `SharedArrayBuffer`（COOP/COEP 跨源隔离环境）就一律用 hls.js**；否则（典型是 Safari 且非隔离）用 `<audio src=m3u8>` 原生播。hls.js 配置：`enableWorker:true, maxBufferLength:10, maxMaxBufferLength:20, backBufferLength:0, maxBufferSize:60MB, maxBufferHole:0.5`。

#### Range / Cookie 依赖

| 路径 | Range | 说明 |
|---|---|---|
| HLS（m3u8/ts） | **不用** Range，由 hls.js 按分片请求 | — |
| 直连 `/track/stream` | `<audio>` 自行发 Range（`transport:"range"`，A `Yl` @282268） | — |
| 直连额外探测 1 | `Range: bytes=0-0`——判 404/410 | A `detectHttpNotFound` @309474 |
| 直连额外探测 2 | `Range: bytes=0-1048575`——抓前 1 MB 解嵌入封面/标签 | A `fetchMetadataChunk` @318609，`wu=1*1024*1024` @290864 |
| 直连时长兜底 | `HEAD` + 响应头 `X-Audio-Duration` | A `fetchDurationFromHeader` |

两处 Range 的原文：

```js
headers:t===e?{Range:`bytes=0-0`}:void 0
```

```js
async fetchMetadataChunk(e){try{let t=await fetch(e,{headers:{Range:`bytes=0-${wu-1}`}})
```

Cookie：所有上述请求都依赖同源 `music-token` Cookie（唯一鉴权手段）。

#### HLS 错误 → 立即重建（关键行为）

音乐转码会话的 `sessionKind` 是 `"standard"`（A `Xl` @282437），而**A @302794**：

```js
canRetryCurrentHlsSession(){if(!this.currentSource)return!1;let e=this.getDelivery(this.currentSource);return e?.kind===`hls`?e.sessionKind===`legacy-unified`
```

`"standard"` ≠ `"legacy-unified"` → **返回 false** → 策略层不做自愈重试，遇到 404/410/manifest/frag 错误直接上抛：

```js
if(c.response?.code===404||c.response?.code===410){this.hlsFatalErrorHandled=!0,s.destroy(),this.hls=null,this.emitHlsSessionExpired(`HLS 资源已过期，正在重新解析播放源`,c)
```

`emitHlsSessionExpired` → `emit(ERROR, {type:"HLS_TASK_EXPIRED"})`（A @303060）→ 引擎 `handleHlsTaskExpired()`（≤2 次）→ 重新 POST transcode。
非 404/410 的资源类错误走 `hlsResourceErrorCount` ≤ 3 的软重试（只发 `HLS_RECOVERING` 警告），超限 → `HLS_RETRY_FAILED` → 提示并跳下一首。

### 3.6 什么时候转码、什么时候直连 ✅确证

判定入口（**A @625701**）：

```js
?{source:Yl({url:fh(i.trackId),format:o||`mp3`,metadata:l.metadata,transport:`range`}),trackPatch:l,session:null}:(await bh(i.trackId,{quality:t,channel:c.outputChannels,signal:n})
```

条件表达式是 `!wh(e) && oh({...})`：为真走上面的直连分支，为假走下面的转码分支。

#### 三个决策函数

**A @621629 / @621763 / @621882**：

```js
function ih({forceDecodePlayback:e,isCue:t,outputChannels:n,sourceChannels:r,sourceFormat:i}){return e||t||!ql(i)?!1:!r||r<=2?!0:n>=r}
```

```js
function ah({forceDecodePlayback:e,isCue:t,sourceFormat:n,sourceSizeBytes:r}){return t||!n||!e&&rh(n,r)?!1:e?!0:!ql(n)}
```

```js
function oh(e){return ih(e)||e.allowClientWasmPlayback!==!1&&ah(e)&&Yc()}
```

**A @621505 / @621463**：

```js
var nh=new Set([`dff`,`dsf`,`tak`,`tta`]);function rh(e,t){return!e||!nh.has(e)?!1:typeof t==`number`&&Number.isFinite(t)&&t>qc.clientWasm.fullDownloadSizeLimitBytes}
```

**A @625242 / @625384 / @625626**：

```js
function Ch(e){return e.playbackMethod===`decode`||e.context?.playbackMethod===`decode`
```

```js
function wh(e){if(e.context?.fallback?.reason===`client-decode-failed`)return!0;
```

```js
function Th(e){return e.context?.fallback?.reason!==`client-decode-failed`}
```

**A @262628**：

```js
function Yc(e=qc,t=Jc()){return e.enableWasm&&t.isSecureContext&&t.crossOriginIsolated&&t.hasSharedArrayBuffer}
```

#### 人类可读规则

**第 0 步：强制转码（`wh`，一票否决直连）**

* 上次是"客户端 WASM 解码失败"（`fallback.reason === "client-decode-failed"`）→ **必须转码**；
* 上次是"原生播放失败"（`native-playback-failed`）且底层 `MediaError` 归类为 `decode` 或 `source-not-supported` → **必须转码**；
* 其它情况（含首次播放）→ 不强制，继续往下判。

**第 1 步：能不能浏览器原生直连（`ih`）**

全部满足才算能：

1. 不是"强制走解码器"（`forceDecodePlayback` 为假）；
2. **不是 CUE 整轨**（`isCue` 为真 → 一律转码）；
3. `ql(sourceFormat)` 为真，即该格式浏览器能原生解：
   * 先 `Kl()` 归一化：`cue|cue-track→cue`；`mpeg|mp3→mp3`；`audio/wav|audio/wave|audio/x-wav|wave|wav|pcm_*|lpcm|pcm→wav`；`mp4a|mp4|m4a→m4a`；其余小写去空格原样；
   * 硬黑名单（**A @267422**）`Pl = {ape, cue, dff, dsd, dsf, tak, tta, wv}` 直接不支持；
   * 映射表（**A @267245**）`Nl = {aac, alac, flac, m4a→AAC, mp3, mp4→AAC, mp4a→AAC, mpeg→MP3, ogg→VORBIS, opus, pcm, vorbis, wav→PCM, wave→PCM}`——**表里没有的格式**（如 `au`、`mmf`、`ra`、`voc`、`aiff`、`wma`、`amr` …）也不支持；
   * 最后还要浏览器 `canPlayType()` 真的能放（例如无 FLAC 支持的浏览器上 flac 也算不支持）。
4. 声道数：源 ≤ 2 声道（或未知）→ 通过；源 > 2 声道 → 必须 `outputChannels >= sourceChannels`（设备放不下多声道 → 走转码降混）。

**第 2 步：能不能客户端 WASM 解码后直连（`ah` + `Yc()`）**

1. `allowClientWasmPlayback !== false`（即上次不是 WASM 解码失败）；
2. 不是 CUE、`sourceFormat` 非空；
3. **体积闸门**：格式 ∈ `{dff, dsf, tak, tta}`（需整文件下载）且 `audioSpec.size > 100 MiB` → 拒绝（`rh`）；`forceDecodePlayback` 为真时跳过这条闸门；
4. `forceDecodePlayback` 为真 → 直接算能；否则要求 `!ql(sourceFormat)`（**WASM 只用来补浏览器放不了的格式**，能原生放的不走 WASM）；
5. 运行环境必须满足 `Yc()`：`enableWasm`(true) **且** `isSecureContext` **且** `crossOriginIsolated` **且** 有 `SharedArrayBuffer`。缺任一条（例如没配 COOP/COEP）→ WASM 路径不可用。

**第 3 步：都不行 → 服务端转码 + HLS**

```
转码条件 = wh(ctx)  ||  ( !ih(...)  &&  !( allowWasm && ah(...) && Yc() ) )
```

典型必转码场景：CUE 整轨；ape/wv/dsd/dsf/dff/tak/tta 等在非隔离环境；>100 MB 的 dsf/dff/tak/tta；多声道（如 5.1 FLAC）在立体声设备上；上次原生解码/WASM 解码失败后的重试。

**体积上限**只有 `clientWasm.fullDownloadSizeLimitBytes = 100 MiB` 这一条，且**只对 `{dff,dsf,tak,tta}` 生效**——不是通用体积上限。

#### 源格式是怎么定出来的（`gh`，A @622976）

```js
function gh(e,t){let n=Kl(e.audioSpec?.format);if(n&&n!==`cue`)return n;let r=Kl(t),i=Kl(e.audioSpec?.container)
```

优先级：

1. `audioSpec.format`（非 `cue`）→ 用它；
2. 否则：若 `formatHint` ∈ `lh = {ape,au,dff,dsd,dsf,mmf,ra,tak,tta,voc,wv}`（**A @621955**）且 `container` 为空或 `wav` 且 `codec === "wav"` → 用 `formatHint`（**用于纠正服务端把 DSD/APE 之类探成 wav 的情况**）；
3. 否则 `container`（非 cue）；
4. 否则 `codec`（非 cue）；
5. 否则 `formatHint`。

顺带：`ku`/`Au` 常量（**A @324345 / @324460**）记录了策略层的静态清单——`NATIVE_FORMATS:[mp3,aac,wav,m4a,ogg]`、`PREFETCH_FORMATS:[flac,ape,mp3,wav,ogg,m4a,aac,wv]`、`FULL_DOWNLOAD_FORMATS:[dsf,dff,tak,tta]`。注意**真正参与直连/转码判定的是 `Nl`/`Pl`/`nh`/`lh`，不是 `Au`**。

字段 `needsTranscode` 在整个 bundle 里恒为 `false` 或原样透传，**从不参与判定**（历史遗留）。

### 3.7 `GET /track/metadata` 与 `audioSpec` ✅确证

请求：`GET`，参数 `{guid}` → `?guid=<guid>`。带单飞去重 + 引用计数取消（**A @620406**）：

```js
qm=(e,t={})=>Gm(Km,e,t.signal,t=>$n.track.metadata({guid:e}
```

404 会被翻译成播放层 404（**A @624276**）：

```js
async function yh(e,t){try{return await vh(e,t)}catch(t){throw Hm(t)?eu(404,fh(e)):t}}
```

响应 `data` 形如 `{ track: {...}, audioSpec: {...} }`（`_h` A @623250 用 `t.track.*`；`i_` 用 `let{audioSpec:n,track:r}=e`）。

#### audioSpec 字段（与播放判定相关）

归一化函数（**C @126475**，关键字 `ll=e=>{let t=e?.path`）：

```js
ll=e=>{let t=e?.path??``,n=cl(t),r=e?.format?.trim().toLowerCase()||n||`audio`;return{bitDepth:e?.bitDepth,bitrate:e?.bitrate?Math.round(e.bitrate/1e3):void 0,channels:e?.channel,codec:e?.codec
```

| 原始字段 | 类型 | 单位/语义 | 判定中的用途 |
|---|---|---|---|
| `format` | string | 容器/格式名，可能是 `cue` | `gh()` 第一优先级 → `sourceFormat` |
| `container` | string | 容器名（`ll` 不导出，但 `gh`/`i_` 直读） | `gh()` 第 2/3 优先级 |
| `codec` | string | 编解码器名 | `gh()` 第 2/4 优先级 |
| `channel` | number | **声道数（单数拼写！）** | `Sh()` → `sourceChannels` → `outputChannels` → `output.channel` |
| `size` | number | 字节 | `rh()` 的 100 MiB 闸门 |
| `duration` | number | **毫秒**（`mh()` 里 `/1e3` 取秒） | `playbackDuration.authoritative` → HLS 无时长时的权威时长 |
| `sampleRate` | number | Hz | 仅展示 |
| `bitDepth` | number | bit | 仅展示 |
| `bitrate` | number | **bps**（UI 显示时 `/1000` 转 kbps） | 仅展示 |
| `path` | string | 服务器文件路径（用于取扩展名） | 兜底格式推断 |

注意归一化后的对象把 `channel` 改名成 `channels`（`channels:e?.channel`）——**接口原始字段是单数 `channel`**，别写错。

#### track 字段（播放相关）

`guid`、`title`、`artists[]`、`album{guid,name,coverId,artists,originalReleaseYear}`、`genres[]`、`coverId`/`coverGUID`、`isFavorite`、`hasLyric`、`isCue`、`trackNo`、`discNo`、`duration`（**毫秒**）、`year`、`createdAt`、`updatedAt`（证据：**C @348031** `function sd(e,t,n){let r=ll(e.audioSpec)`，**A @623250** `_h`）。

时长口径（**A @622752**）：

```js
let n=t?e.track.duration:e.audioSpec?.duration??e.track.duration;return n?Math.round(n/1e3):0
```

CUE 轨用 `track.duration`，其它优先 `audioSpec.duration`；两者都是毫秒。

---

## 4. 鉴权与 `authx` 签名（重建客户端必读）✅确证

### 4.1 会话凭据 = Cookie `music-token`

**B @395124**：

```js
Cb=`music-token`,wb=e=>{if(typeof document>`u`)return``;let t=`${e}=`,n=document.cookie.split(`; `)
```

写入方式（**B**，关键字 `Eb=e=>`）：

```js
Eb=e=>{typeof document>`u`||(document.cookie=`${Cb}=${encodeURIComponent(e)}; Path=/; SameSite=Strict`)}
```

服务注册表（**B @391057**）：

```js
rb={music:{authFailure:`music-session`,baseUrl:Gy(),credentials:`include`,defaultResponseContract:`music-envelope`}}
```

即所有 API 请求都 `credentials:"include"`（**B @392310**）：

```js
db=e=>{let t=ub.get(e);if(t)return t;let n=Ry(My({fetch:(t,n)=>globalThis.fetch(t,{...n,credentials:e})}),{apiKey:Ky})
```

### 4.2 `authx` 签名头

拦截器（**B @389975**）给**每个** API 请求加头：

```js
e.headers.set(`authx`,Ly(e,t.apiKey))
```

签名算法（**B @389536**）：

```js
let n=e.method.toUpperCase()===`GET`,[r,i]=Py(e.url),a=n?Ny(i):e.data===null||e.data===void 0?``:JSON.stringify(e.data),o=n?Fy(a):Iy(a)
```

```js
l=[`NDzZTVxnRKP8Z0jXg1VAMonaG8akvh`,r,s,c,o,t].join(`_`);return`nonce=${s}&timestamp=${c}&sign=${Ze.default.hash(l)}`
```

* `Ze` = **SparkMD5**（**B @10496** `r.SparkMD5=n()`），`hash()` 返回小写十六进制 MD5；
* `r` = URL 的 **pathname**（如 `/music/api/v1/track/transcode`）；
* `s` = nonce = `Math.floor(Math.random()*9e5)+1e5` → 6 位数字 100000–999999；
* `c` = `Date.now()` 毫秒字符串；
* `o` = 载荷摘要：
  * **POST**：`md5(JSON.stringify(body))`；body 为 null/undefined 时 `md5("")`；
  * **GET**：先 `Ny(query)`（**B @389055**：key 按 `sort()` 排序、`URLSearchParams` 序列化、`+`→`%20`），再 `md5(decodeURIComponent(...))`；
* `t` = apiKey = **`6D5602D4-A342-4799-A0F0-BB795E7167D0`**——源码里用 XOR 混淆（**B @390144**）：

```js
Ky=(()=>{let e=new Uint8Array([143,253,140,143,137,139,
```

36 字节逐个 `^185` 解出上述 UUID（我在本地纯计算解码，未联网）。

最终头形如：`authx: nonce=482913&timestamp=1757049600123&sign=<md5hex>`。

### 4.3 URL 拼接

**B @391831**：`sb()` 用 `new URL(base.endsWith("/")?base:base+"/", origin)` 再拼相对 path，参数由 `ob()` 写进 `searchParams`（数组会 `append` 多次，`null/undefined` 跳过）。

### 4.4 媒体请求（m3u8 / ts / stream）

**不经过** API 客户端 → **不带 `authx`、不带 `Content-Type`**，只有浏览器自动附加的同源 Cookie。

---

## 5. 推测部分（需联网实测才能确认）⚠️

> 以下都**不是**从代码直读的结论，标注了各自的验证方法。**本次分析没有执行任何联网请求。**

| # | 推测 | 依据 | 验证方法（需你在真机执行） |
|---|---|---|---|
| 1 | `output.bitrate` 对 FLAC 而言可能是**档位标识**而非真实码率（FLAC 无损，320 kbps 没有物理意义），服务端可能忽略它或用它选预设 | `$l` 三档都是 `codec:"flac"`，只有 bitrate 变 | `curl -X POST '<base>/track/transcode' -H 'authx: …' -b 'music-token=…' -d '{"guid":"…","output":{"codec":"flac","bitrate":128,"channel":2}}'`，再对比 `preset.m3u8` 的分片体积/`#EXT-X-STREAM-INF` |
| 2 | 服务端可能返回 `pending`/`processing` 之类中间态；Web 端会当致命错误 | 客户端只认 `success`/`ready`/`failed` | 对一首大文件（>500 MB DSD）首次 POST，观察是否立刻 `ready` |
| 3 | `output` 可能还接受 `sampleRate`/`bitDepth`/`format`/`container` | Web 端不发，但服务端可能支持 | 逐个加字段 POST，看是否 `InvalidArgs(100002)` |
| 4 | `preset.m3u8` 与分片接口**可能不校验 `authx`**，只校验 Cookie | 客户端确实没给它们加签名 | 带 Cookie 不带 `authx` 请求 m3u8；再反过来只带 `authx` 不带 Cookie |
| 5 | 服务端心跳超时阈值未知（10 s 间隔暗示可能是 30–60 s） | 客户端只固定 10 s | POST transcode 后停止心跳，定时 `curl` m3u8，记录首次 404/410 的时间 |
| 6 | `/track/transcode/quit` 的幂等性未知 | 客户端不重试 | 连续 quit 两次，看第二次返回 code |
| 7 | 重复 POST 同一 guid 是否复用任务、是否重置心跳 | 重建流程会重复 POST | 连续两次 POST 相同 body，比较返回与任务行为 |
| 8 | `X-Task-Rebuilt`/`X-New-Playlist-Url` 的实际触发条件 | 客户端只被动响应 | 播放中改音质/改设置，抓包看是否出现这两个头 |
| 9 | `errmsg`/`errno` 的具体取值域 | 只在失败分支被读 | 构造非法 guid / 不支持的 codec 触发 `failed` |
| 10 | `bitrate=128/256` 是否真的会被接受 | Web 端从不发 | 同 #1 |
| 11 | `/track/stream` 是否支持多段 Range、是否有并发/限速 | 客户端只用简单 Range | `curl -r 0-0` / `-r 100-200` 对比 `206`/`Content-Range` |
| 12 | 页面关闭后任务的实际回收时间 | 客户端不发 quit | 打开播放后直接关标签页，轮询 m3u8 观察失效时间 |

---

## 6. 仍未确定 / 无法从前端确定的字段清单

* `POST /track/transcode` 成功响应里除 `status` / `errmsg` / `errno` 之外的**所有字段**（客户端一律不读，很可能还有 taskId / playlistUrl / duration / segments 等）。
* `status` 的完整枚举（前端只覆盖 `success`/`ready`/`failed`）。
* `errno` 的类型（number 还是 string）与取值表。
* `/track/transcode/heartbeat` 与 `/quit` 的响应体结构（客户端只判 envelope 成功）。
* `output` 是否存在前端未使用的字段（`sampleRate`/`bitDepth`/`format`/`seek`/`startTime` 等）。
* `preset.m3u8` 的实际内容（是否 master playlist、分片时长、是否含 `#EXT-X-ENDLIST`）。
* 服务端心跳超时窗口、任务并发上限、同一 guid 多会话隔离方式。
* `audioSpec` 是否还有前端未消费的字段（如 `profile`、`lossless`、`replayGain`）。
* 服务端对 `channel` 的合法取值（是否接受 6/8，还是只接受 1/2）。
* CUE 整轨转码时是否需要额外传 `cueStartTime`/`cueEndTime`——前端**没有**传，但 CUE 一定走转码，服务端如何切段未知。

---

## 附录：本文档引用的全部锚点速查

```
A = 1bc04b5291c26a46d918139138b992d2-uPVOgwab.js
  262296 qc 配置            267245 Nl 编解码映射     267422 Pl 黑名单
  281284 Hl 能力探测        281491 Kl 格式归一化     281733 ql 原生可播
  282268 Yl 直连描述        282437 Xl HLS 描述       283856 $l 音质映射
  290406 bu Safari 判定     290864 wu=1MB            291388 MAX_HLS_RETRIES
  291895 MAX_MEDIA_RECOVERY 293810 createAudioElement
  296462 getRequestedOutputChannels                  302031 getDelivery
  302794 canRetryCurrentHlsSession                   303060 emitHlsSessionExpired
  304588 canPlayHlsNatively 309426 isHttpNotFoundStatus  309474 detectHttpNotFound
  310985 loadWithHls        311541 xhrSetup           316213 retryHlsSession
  317637 handleTaskRebuilt  318609 fetchMetadataChunk 324345 ku  324460 Au
  619606 Hm 404 判定        619720 Wm abort 检查      620406 qm metadata 单飞
  620646 Qm                 620745 $m 声道钳制        621010 th 设备声道
  621463 nh 全下载格式      621505 rh 体积闸门        621629 ih 原生可直连
  621763 ah WASM 可直连     621882 oh 本地可播        621955 sh/ch/lh
  622600 fh stream URL      622674 ph m3u8 URL        622752 mh 时长
  622976 gh 源格式推导      623250 _h trackPatch      624276 yh metadata+404
  624362 bh 开始转码        624803 xh 心跳/退出会话   625134 Sh 声道决策
  625242 Ch 强制解码        625384 wh 强制转码        625626 Th 允许 WASM
  625701 Eh.resolveTrackPlayback                     652430 av sendBeacon
  656623 Pv quality 注入    970063 MAX_HLS_REBUILD_ATTEMPTS
  986605 切歌 dispose/detach                          987403 disposeStaleResolvedSession
  990265 startPlaybackHeartbeat  990640 sendPlaybackHeartbeat
  991018 getHeartbeatTime   991282 disposePlaybackSession
  991414 disposePlaybackSessionAndWait               991577 takeOwnedPlaybackSessions
  991966 disposePendingPlaybackSession               992251 disposeSession
  992395 detachPlaybackSession                       1003410 handleHlsTaskExpired

B = bdf49c3c3882102fc017ffb661108c63-DxzHiN_b.js
  10496  SparkMD5           36968  pt=sleep           187914 fl='/music'
  193047 hlsPreset 路径     199318 metadata 描述符    199470 transcode 描述符
  201073 Vu=[0,200]         202486 Uu 成功码判定      202507 Wu 登录过期判定
  208803 rd envelope 解包   389055 Ny 查询串排序      389536 Ly authx 签名
  389975 set('authx')       390022 zy/By 基址        390116 Gy baseUrl()
  390144 Ky apiKey(XOR)     390837 tb 登录过期处理    391057 rb 服务注册表
  391831 sb URL 拼接        392115 lb 请求头          392310 db fetch 客户端
  393955 yb 请求主流程      394608 bb 基址选择        394694 xb body/params
  394775 Sb API 客户端      395124 Cb='music-token'

C = b718f1354f7247312eca086d9a024afe-SiPo1ec7.js
  124349 playback i18n keys 126475 ll audioSpec 归一化 348031 sd track 映射
```
