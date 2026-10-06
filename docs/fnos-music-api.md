# 飞牛音乐 (fnOS Music) 私有 API 实测笔记 (recon by DSH, 2026-09-04)

Base: {origin}/music/api/v1 ; envelope {code,msg,data}, code 0 = ok
errors: 99999 INVALID TOKEN(401) / 100001 unknown error(payload shape) / 100002 invalid arguments / 100003 forbidden, admin only / 100005 resource not found
server: serverVersion 1.0.0（2026-09-17 实测已升到 **1.0.1**）, mediasrvVersion 0.8.41
     本行是**该行写下时的实测点**，不是当前版本；2026-09-27 的复采见
     [智能推荐与AI-路线图](./智能推荐与AI-路线图.md) 1.2 节（fnOS 1.0.10 / mediasrv 0.8.42）。

## auth
POST /user/password-login {username, password: sha256hex(plain), deviceId} -> {userToken, user{guid,name,role,...}}
token NOT in Set-Cookie. transports that work: "authorization: <token>" (raw) | "Cookie: music-token=<token>"
NOT working: Authorization Bearer, x-music-token, ?token=
NAS OAuth: /sys/config -> nasOAuth.clientId ; POST /user/auth-login {code, deviceId}
password change uses sha256(new). Account ban exists (/user/unbanned, admin only).

### 请求签名头 `authx`（**音乐 API 不校验，我们不实现**）

**实测结论（2026-09-17，真实 NAS，只读）**：音乐 API **完全不校验 `authx`** ——
`GET /user/me` 不带 / 带正确签名 / 带故意写错的签名，三种都返回 `code=0`。
所以我们客户端**只发 `authorization: <token>`**，不发 `authx`、也不发 `X-Music-API`，是安全的。
（云端 `fn/con` 端点会校验，报 `{"code":5000,"msg":"invalid sign"}` —— 校验是**按端点**开关的。）

⚠️ 风险形态：这类收紧是**开关式**的，一开就是全量 401，不会渐进 —— 升级 NAS 后跑一次冒烟即可发现。

> **签名算法与常量不在本公开文档里。** 我们客户端**不实现、不使用**该签名，记录它对功能没有价值，
> 而公开「逆向得到的密钥常量」是不必要的合规暴露。完整算法留在**本地内部文档**
> （按 gitignore 不随仓库发布），仅备「万一飞牛在音乐 API 上收紧」时查阅。

### 我们没用过、但实测可用的端点（2026-09-17，只读）

| 端点 | 返回 | 用途 / 注意 |
| --- | --- | --- |
| `GET /artist/detail?guid=` | `{guid,name,coverId,createdAt,updatedAt,trackCount,albumCount}` | 艺术家权威名字与计数（**没有简介/相似艺术家** —— 那要外部数据） |
| `GET /genre/detail?guid=` | `{guid,name,coverId,createdAt,updatedAt,trackCount}` | 流派详情（无 albumCount） |
| `GET /artist/list-all` | `{list,total}`，**忽略 page/size**；实测 5510 条 / 825 KB | 一次性全量艺术家（本地索引 / 离线搜索）；体积要有数 |
| `GET /shared-library/list` | `{list:[{guid,name,path,autoDownloadLyric,metadataPreference,contentLastChangedAt,accessStatus}]}` | 音乐库列表；`name` 可能是空串。实测 2 个库 |
| `GET /task/list` | `{list}`（实测当前 **0 个任务**） | 后台任务；**扫描任务的字段形态仍未测到**（要看必须触发一次扫描 = 写操作） |
| `GET /favorite-track/purge-track-count` | `{total}`（**无参数**） | 「失效收藏」条数 |
| `GET /playlist/purge-track-count?guid=<歌单 guid>` | `{total}` | 参数名就是 **`guid`**（`playlistGUID`/`playlistGuid` 都是 `100002 invalid arguments`） |
| `GET /play-history/list` | `{list,total}`（**没有 `sort` 字段**，与 track 列表不同） | 播放历史 |

### 权限：admin vs 普通用户（2026-09-17 双账号实测）

用 `admin` 与 `member` 两个真实账号各跑一遍同一批 GET（`code=100003 forbidden, admin only` = 拒绝）：

| 端点 | admin | member |
| --- | --- | --- |
| `/settings/server`、`/settings/user` | ✅ | ❌ 100003 |
| `/app-center/authed-dir/list` | ✅ | ❌ 100003 |
| `/user/list` | ✅ | ❌ 100003 |
| **`POST /shared-library/scan`** | ✅ | ❌ 100003 |
| `/shared-library/list` | ✅ | ✅ |
| `/task/list` | ✅ | ✅ |
| `/artist/detail`、`/genre/detail`、`/artist/list-all` | ✅ | ✅ |
| `/favorite-track/purge-track-count` | ✅ | ✅ |
| `/track/list`、`/play-history/list`、`/playlist/list` | ✅ | ✅ |

**数据可见范围**：`/track/list` 两个账号返回**同一批**（曲库是共享的）；而
`/play-history/list`、`/playlist/list` 是**按账号过滤**的（同一时刻两边内容完全不同，member 侧歌单为 0）。
→ 客户端的「我的歌单 / 播放历史」天然每账号独立，不需要额外处理。

**对客户端的含义**：
- 「触发曲库扫描」**只能给 admin 显示**（普通用户会 100003），要靠 `role === 'admin'` 判断 ——
  我们的 `SessionUser.isAdmin` 已经映射了 `/user/me` 的 `role`，直接用即可。
- 「查看扫描进度」（`/task/list`）**普通用户也能看**，可以给所有账号显示。

`GET /sys/config` 实测返回 `serverVersion 1.0.1` / `mediasrvVersion 0.8.41` + `nasOAuth.clientId`。

### 曲库扫描与任务（2026-09-17 实测，触发过一次真实扫描）

`POST /shared-library/scan` body `{"guid": "<sharedLibrary 的 guid>"}` → `code=0`（**admin only**）。
`/shared-library/scan-all` 同为写操作，未单独实测。

任务形态（`GET /task/list`，member 也能读）：

```json
{
  "id": "faeffca3-9903-466d-8570-7eadae0a34b6", "type": "fileScan", "name": "音乐",
  "total": 34338, "successCount": 34336, "failCount": 2,
  "done": false, "retryable": true, "canceled": false, "cancelling": false, "canceledCount": 0,
  "createdAt": 1789646069, "ext": { "libraryGUID": "a929e8d304784f47bb51a2a14ec17688" }
}
```

**做进度 UI 时的三个要点（实测踩出来的）**：
1. **没有百分比字段**，而且 `total` 是**边扫边长**的：0 → 69 → 281 → 512 → 3 495 → … → 34 338
   → **分母一直在变，算不出百分比**。只能显示「已扫描 N 个文件」这类计数，或用不定量进度。
2. **速度参考**：本机约 **80~100 文件/秒**；41k 首的库（还含封面/歌词文件）跑了 8 分钟仍未结束
   （最后观测 34 338 个文件）。所以「扫描中」是个会持续十分钟量级的状态。
3. `failCount` 有 1~2 是**正常**的（个别文件扫描失败），别当异常弹错。
   任务**完成后仍留在 `/task/list` 里**（实测 100 秒后列表仍有它）。
4. 扫描**完成态**（`done: true`）本次没亲眼观测到 —— 扫描在观测窗口内没跑完；字段语义明确，
   但「完成后多久从列表消失 / `contentLastChangedAt` 何时更新」**待补测**。

### 网关与内部服务名

- NAS 内部的音乐服务叫 **`trim.music`**，走 unix socket `/var/run/trim_music.socket`（只有 NAS 本机进程能直连）。
- 本机 web 网关端口：`5666`（http）/ `5667`（https）/ `8000` / `8001` —— 我们用的 `:5666` 就是第一个。
- 第三方桥接项目还会带一个 **`X-Music-API: v1`** 头（只给音乐 API，不给别的服务）；我们不带也能通。

### FN ID 中继：每个请求都必须带 `Cookie: mode=relay`（2026-09-15 实测）

走 FN ID 时 base 是 `https://<fnid>.fnos.net`。这个域名**同时也是浏览器门户**：
不带 `Cookie: mode=relay` 时 nginx 对**所有**路径返回 `302 → https://fnos.net/<fnid>/`，
拿到的是一张 HTML 门户页而不是接口 JSON。带上之后一切照常。

```
带 Cookie: mode=relay   → 200 {"code":0,...,"serverGUID":"fde44845…"}
不带                    → 302 / HTML 门户页
```

两个必须知道的行为：

- **探测也得分带/不带**：`GET <base>/music/api/v1/sys/config` 不带 cookie 是 302，
  所以「探测说不可达」不等于「FN ID 不通」——判定逻辑必须带着标记去探。
- **失败长得像凭据错误**：门户页不是合法信封，客户端会翻成 `protocol`，
  而登录页把 `protocol` 显示成「账号或密码不正确」。**看到的密码错，很可能其实是地址错。**

另外 `https://fnos.net/api/v1/fn/con`（FN Connect 云端解析）**已失效**：
签名头校验仍通过（错的 authx 会返回 `{"code":5000,"msg":"invalid sign"}`），
但任何 fnId 都返回 `{"code":3000037,"msg":"Not Found Error"}`，空 body 也一样。
所以现在只能探测**写死的中继域名** —— 官方一共三个，取自 NAS 自己的域配置：

```
https://<fnid>.fnos.net     https://<fnid>.5ddd.com     https://<fnid>.trzznas.com
```

代价：拿不到云端给的局域网/DDNS 候选，同网段下也会绕一圈公网中继。
客户端目前的补偿办法是把**历史里存过的局域网地址**一起探测，用 `sys/config`
的 `serverGUID` 确认是同一台设备后才改走内网（避免连到另一台 NAS 上）。

## verified param names (2026-09-04, probe against live NAS)
/track/album-detail/list?albumGUID=      (guid / albumGuid -> 100002)
/track/artist-detail/list?artistGUID=
/track/genre-detail/list?genreGUID=
/track/playlist-detail/list?playlistGUID=
/album/artist-detail/list?artistGUID=
/track/metadata?guid=
/lyric/list?trackGUID=
/search/*?q=
POST /favorite-track/create|delete  { trackGuid }   (guid -> 100001, trackGUID -> 100002)
GET  /track/roam-start?deviceId=                     (POST falls back to SPA html!)
GET  /track/roam-next|roam-previous?deviceId=&relativeRoamId=
     roam response: { current: { roamId, track {...} }, next: { roamId, track } }

## paging
page (1-based) + size ; sort="createdAt,desc" | "title,asc" ; resp {list,total,sort}
hasMore = list.length===size && page*size < total
alias: album list createdAt->newTrackAddedAt ; favorites createdAt->favoriteAt
measured library: 41193 tracks / 11484 albums / 5509 artists / 101 genres / 0 playlists

## endpoints (full, from bundle)
album: list, detail, artist-detail/list
artist: list, list-all, detail, create
genre: list, detail, create
track: list, metadata, album-detail/list, artist-detail/list, genre-detail/list, playlist-detail/list, stream, transcode, transcode/heartbeat, transcode/quit, hls/:guid/preset.m3u8, roam-start, roam-next, roam-previous
playlist: list, detail, batch-detail, create, edit, delete, add-track, remove-track, purge-track, purge-track-count
favorite-track: list, create, delete, purge-track, purge-track-count
play-history: list, delete
lyric: list
search: track, album, artist, playlist, suggest
shared-library(admin): list, detail, create, edit, delete, scan, scan-all
task(admin): list, retry, cancel, delete
user: me, list, create, edit, delete, exists, logout, passwd-change, password-login, auth-login, unbanned
settings(admin): /settings/user, /settings/server
misc: /sys/config, /initialization/{state,prepare,confirm}, /event/report, /static/cover, /static/cover/track, /static/cover/playlist, /stream/audio, /stream/pcm, /app-center/authed-dir

## shapes (measured)
track item: {guid,title,coverId,year,discNo,trackNo,isrc,duration(ms),isCue,createdAt,updatedAt,album{guid,name,coverId,releaseDate,barcode},artists[{guid,name,coverId}],genres[],audioSpec?}
album item: {guid,name,coverId,releaseDate,barcode,artists[],trackCount}
artist item: {guid,name,coverId,trackCount,albumCount}
genre item: {guid,name,coverId,trackCount}
shared-library item: {guid,name,path,autoDownloadLyric,metadataPreference,contentLastChangedAt,accessStatus}
/track/metadata?guid= -> audioSpec{bitDepth,sampleRate,channel,bitrate,codec,container,duration,format,path}
/search/track?q=&page=&size=  (param is q) ; /search/suggest?q= -> {track:{total,items},album,artist,playlist}
/lyric/list?trackGUID=  (capital GUID) -> {list, preferred}
cover: GET /static/cover?coverId=<id>&size=<n> -> image/webp, needs authorization header ; coverId like album_<hex>/artist_<hex>/track_<hex>

## playback
direct: GET /track/stream?guid=<guid> with Range -> 206, audio/flac, Accept-Ranges bytes (13.8MB sample)
HEAD is NOT routed (returns SPA html 9126 bytes) -> probe with GET+Range
transcode: POST /track/transcode {guid, output:{...quality, channel}} -> {status}; then /track/hls/{guid}/preset.m3u8 ; requires periodic /track/transcode/heartbeat and /track/transcode/quit on stop. exact output fields TBD.
web player private schemes: hls://<fileId>?quality=original , aac://<fileId>?bitrate=128
roam(radio): GET /track/roam-start?deviceId= -> {current:{roamId,track},next:{...}} ; GET roam-next?deviceId=&relativeRoamId= ; roam-previous same
web audio cache: Cache Storage dir "music-cache", 1.2GB / 20 entries, cache key strips token/sign/expires params

## permissions
member role: /settings/user and /settings/server -> 100003 forbidden, admin only. Library/task/user mgmt = admin only.

## playlist 写操作（2026-09-06 静态分析 + 只读验证）

读接口（已实测）：
- GET /playlist/list（前端不传分页）-> {list, total}
- GET /playlist/detail?guid=
- GET /playlist/batch-detail?guids=<逗号分隔，前端 100/批> -> [{guid, trackCount}]
- GET /track/playlist-detail/list?playlistGUID=&page=&size=&sort=trackAddedAt,desc
- GET /playlist/purge-track-count?guid=

写接口（从 web 端 JS 的路径表提取，**未实测**，避免污染真实数据；POST 走 JSON body）：
- POST /playlist/create {name, coverId}          name 长度 1-32，歌单上限 99999
- POST /playlist/edit {guid, name, coverId}
- POST /playlist/delete {guid}
- POST /playlist/add-track {guid, trackGUIDs[]}
- POST /playlist/remove-track {guid, trackGUIDs[]}
- POST /playlist/purge-track {guid}
- POST /static/cover/playlist  multipart file（<=5MB, jpg/jpeg/png/webp）-> {coverId}

错误码：160001 PlaylistNameExists / 160002 PlaylistHitMaxCount / 100002 InvalidArgs / 100005 NotFound。
权限：web 端 canEdit/canDelete/canPurgeTracks 硬编码 true，member 角色也能读写歌单（AdminRequired=100003 只用于库/用户管理）。

**没有**任何 reorder / move-track / sort / import / export / m3u 端点：歌单内顺序只由
/track/playlist-detail/list 的 sort（trackAddedAt 等）决定，web 端也没有拖拽排序。
所以 App 端「导入歌单」只能是：create 建歌单 -> 用 /search/track 或 /track/list 匹配出 trackGUID
-> 分批 add-track（顺序靠 trackAddedAt 递增近似保留，无法真正持久化手工顺序）。

写路径无法用 GET 探测存在性：nginx 的 SPA fallback 对任何未命中路由都返回 index.html（200 HTML），
OPTIONS 也一律 200，所以只有真发 POST 才能确认——刻意没做。

## client mapping (this repo)
Endpoint table: packages/provider-fnos/src/endpoints.ts (only place allowed to hold endpoint strings)
Response schemas: packages/provider-fnos/src/schemas.ts (zod, tolerant nullish)
Contract tests: packages/provider-fnos/test/contract (FNOS_BASE_URL/FNOS_USERNAME/FNOS_PASSWORD env, skipped without them)
Param probe helper: packages/provider-fnos/scripts/probe-params.mts

## caveat
Private, undocumented, mediasrv still 0.8.x -> centralize endpoint defs, strict schema validation, contract tests against the real NAS.
