# 飞牛音乐 (fnOS Music) 私有 API 实测笔记 (recon by DSH, 2026-09-04)

Base: {origin}/music/api/v1 ; envelope {code,msg,data}, code 0 = ok
errors: 99999 INVALID TOKEN(401) / 100001 unknown error(payload shape) / 100002 invalid arguments / 100003 forbidden, admin only / 100005 resource not found
server: serverVersion 1.0.0, mediasrvVersion 0.8.41

## auth
POST /user/password-login {username, password: sha256hex(plain), deviceId} -> {userToken, user{guid,name,role,...}}
token NOT in Set-Cookie. transports that work: "authorization: <token>" (raw) | "Cookie: music-token=<token>"
NOT working: Authorization Bearer, x-music-token, ?token=
NAS OAuth: /sys/config -> nasOAuth.clientId ; POST /user/auth-login {code, deviceId}
password change uses sha256(new). Account ban exists (/user/unbanned, admin only).

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
