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
roam(radio): /track/roam-start {deviceId} -> {current,next} ; roam-next {deviceId,relativeRoamId} ; roam-previous
web audio cache: Cache Storage dir "music-cache", 1.2GB / 20 entries, cache key strips token/sign/expires params

## permissions
member role: /settings/user and /settings/server -> 100003 forbidden, admin only. Library/task/user mgmt = admin only.

## caveat
Private, undocumented, mediasrv still 0.8.x -> centralize endpoint defs, strict schema validation, contract tests against the real NAS.
