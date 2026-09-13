import { describe, expect, it } from 'vitest'
import { parseHlsPlaylist, resolveUri, UnsupportedPlaylistError } from '../../src/player/hls-playlist'

/**
 * 下面这份是**真实产物**：用 ffmpeg 以飞牛转码相同的参数生成
 * （`-c:a flac -f hls -hls_segment_type fmp4 -hls_time 2 -hls_playlist_type vod`），
 * 形状与 `docs/fnos-transcode.md` 记录的实测结果一致：
 * VOD + `#EXT-X-MAP:URI="init.mp4"` + 2 秒分片 + `#EXT-X-ENDLIST`。
 */
const REAL_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="init.mp4"
#EXTINF:2.089796,
seg0.m4s
#EXTINF:1.985306,
seg1.m4s
#EXTINF:1.985306,
seg2.m4s
#EXTINF:0.104490,
seg3.m4s
#EXT-X-ENDLIST
`

const BASE = 'http://192.168.2.100:5666/music/api/v1/track/hls/abc-123/preset.m3u8'

describe('HLS 点播播放列表解析', () => {
  it('解析真实转码产物：init + 有序分片 + 时长 + 完整标记', () => {
    const playlist = parseHlsPlaylist(REAL_PLAYLIST, BASE)

    expect(playlist.initUri).toBe(
      'http://192.168.2.100:5666/music/api/v1/track/hls/abc-123/init.mp4',
    )
    // 顺序必须与播放列表一致 —— 拼错顺序会得到一个能打开但时间轴错乱的文件
    expect(playlist.segmentUris).toEqual([
      'http://192.168.2.100:5666/music/api/v1/track/hls/abc-123/seg0.m4s',
      'http://192.168.2.100:5666/music/api/v1/track/hls/abc-123/seg1.m4s',
      'http://192.168.2.100:5666/music/api/v1/track/hls/abc-123/seg2.m4s',
      'http://192.168.2.100:5666/music/api/v1/track/hls/abc-123/seg3.m4s',
    ])
    expect(playlist.durationSeconds).toBeCloseTo(6.165, 3)
    expect(playlist.isComplete).toBe(true)
  })

  it('CRLF 换行也能解析', () => {
    const playlist = parseHlsPlaylist(REAL_PLAYLIST.replace(/\n/g, '\r\n'), BASE)
    expect(playlist.segmentUris).toHaveLength(4)
  })

  it('分片地址是绝对 URL 时原样保留', () => {
    const text = `#EXTM3U
#EXT-X-MAP:URI="http://cdn.example.com/init.mp4"
#EXTINF:2,
http://cdn.example.com/seg0.m4s
#EXT-X-ENDLIST
`
    const playlist = parseHlsPlaylist(text, BASE)
    expect(playlist.initUri).toBe('http://cdn.example.com/init.mp4')
    expect(playlist.segmentUris).toEqual(['http://cdn.example.com/seg0.m4s'])
  })

  it('没有 EXT-X-ENDLIST 时不标记为完整（不能当"下载完就完整"处理）', () => {
    const playlist = parseHlsPlaylist(REAL_PLAYLIST.replace('#EXT-X-ENDLIST\n', ''), BASE)
    expect(playlist.isComplete).toBe(false)
  })

  it('没有 EXT-X-MAP 时 initUri 为 undefined（不是空串）', () => {
    const text = `#EXTM3U
#EXTINF:2,
seg0.m4s
#EXT-X-ENDLIST
`
    expect(parseHlsPlaylist(text, BASE).initUri).toBeUndefined()
  })
})

describe('HLS 解析必须明确拒绝的情况', () => {
  it('加密列表（EXT-X-KEY）：拼出来的是密文，必须失败而不是产出坏文件', () => {
    const text = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:2,
seg0.m4s
#EXT-X-ENDLIST
`
    expect(() => parseHlsPlaylist(text, BASE)).toThrow(UnsupportedPlaylistError)
  })

  it('EXT-X-MAP 带 BYTERANGE 时拒绝', () => {
    const text = `#EXTM3U
#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@0"
#EXTINF:2,
seg0.m4s
#EXT-X-ENDLIST
`
    expect(() => parseHlsPlaylist(text, BASE)).toThrow(UnsupportedPlaylistError)
  })

  it('EXT-X-MAP 缺 URI 时拒绝', () => {
    const text = `#EXTM3U
#EXT-X-MAP:BYTERANGE="100@0"
#EXTINF:2,
seg0.m4s
#EXT-X-ENDLIST
`
    expect(() => parseHlsPlaylist(text, BASE)).toThrow(UnsupportedPlaylistError)
  })

  it('分片前没有 EXTINF（按字节区间的列表）时拒绝', () => {
    const text = `#EXTM3U
seg0.m4s
#EXT-X-ENDLIST
`
    expect(() => parseHlsPlaylist(text, BASE)).toThrow(UnsupportedPlaylistError)
  })

  it('没有任何分片时拒绝', () => {
    expect(() => parseHlsPlaylist('#EXTM3U\n#EXT-X-ENDLIST\n', BASE)).toThrow(UnsupportedPlaylistError)
  })
})

describe('地址解析', () => {
  it('相对地址以播放列表所在目录为基准', () => {
    expect(resolveUri('seg0.m4s', BASE)).toBe(
      'http://192.168.2.100:5666/music/api/v1/track/hls/abc-123/seg0.m4s',
    )
  })

  it('带路径的相对地址逐级回退', () => {
    expect(resolveUri('../other/seg1.m4s', BASE)).toBe(
      'http://192.168.2.100:5666/music/api/v1/track/hls/other/seg1.m4s',
    )
  })

  it('绝对地址原样返回（含协议相对）', () => {
    expect(resolveUri('https://a.example.com/x.m4s', BASE)).toBe('https://a.example.com/x.m4s')
    expect(resolveUri('//a.example.com/x.m4s', BASE)).toBe('//a.example.com/x.m4s')
  })

  it('地址里的 query 会被保留（鉴权 token 可能挂在这里）', () => {
    expect(resolveUri('seg0.m4s?token=abc', BASE)).toBe(
      'http://192.168.2.100:5666/music/api/v1/track/hls/abc-123/seg0.m4s?token=abc',
    )
  })
})
