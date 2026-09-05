import { describe, expect, it, vi } from 'vitest'
import { isMusicError } from '@qj/core-domain'
import type { ServerConnection } from '@qj/provider-api'
import { FnosProvider } from '../../src/provider'

const connection: ServerConnection = {
  id: 'srv-test',
  providerId: 'fnos',
  displayName: '测试 NAS',
  baseUrl: 'http://192.168.2.100:5666',
  username: 'test',
}

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = handler(String(input), init)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

function makeProvider(fetchImpl: typeof fetch, token = 'tok-123') {
  return new FnosProvider(
    connection,
    { sha256Hex: async (input) => `sha256(${input})`, deviceId: 'device-1', fetchImpl },
    { token, user: { id: 'u1', name: 'test', isAdmin: false }, deviceId: 'device-1', createdAt: 0 },
  )
}

describe('登录', () => {
  it('密码以 sha256 提交，并带上 deviceId', async () => {
    let captured: { url: string; body: unknown } | undefined
    const provider = new FnosProvider(connection, {
      sha256Hex: async () => 'hashed-password',
      deviceId: 'device-1',
      fetchImpl: fakeFetch((url, init) => {
        captured = { url, body: JSON.parse(String(init?.body)) }
        return { code: 0, msg: '', data: { userToken: 'tok-abc', user: { guid: 'u1', name: 'test', role: 'member' } } }
      }),
    })

    const session = await provider.login({ password: '示例密码-不是真实凭据' })

    expect(captured?.url).toBe('http://192.168.2.100:5666/music/api/v1/user/password-login')
    expect(captured?.body).toEqual({ username: 'test', password: 'hashed-password', deviceId: 'device-1' })
    expect(session.token).toBe('tok-abc')
    expect(session.user).toEqual({ id: 'u1', name: 'test', isAdmin: false })
  })
})

describe('分页请求', () => {
  it('按 page/size/sort 拼查询串并算出 hasMore', async () => {
    const urls: string[] = []
    const provider = makeProvider(
      fakeFetch((url) => {
        urls.push(url)
        return { code: 0, msg: '', data: { list: [{ guid: 'a1', name: '专辑', artists: [] }], total: 10, sort: 'newTrackAddedAt,desc' } }
      }),
    )

    const page = await provider.albums({ page: 1, size: 1, sort: { field: 'createdAt', order: 'desc' } })

    expect(urls[0]).toContain('/album/list?')
    expect(urls[0]).toContain('page=1')
    expect(urls[0]).toContain('size=1')
    expect(urls[0]).toContain('sort=newTrackAddedAt%2Cdesc')
    expect(page.hasMore).toBe(true)
    expect(page.items[0]?.name).toBe('专辑')
  })
})

describe('错误码翻译', () => {
  it('99999 变成 unauthorized', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 99999, msg: 'INVALID TOKEN', data: null }), 401))
    await expect(provider.currentUser()).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'unauthorized' && error.needsReauth)
  })

  it('100003 变成 forbidden', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 100003, msg: 'forbidden, admin only', data: null })))
    await expect(provider.currentUser()).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'forbidden')
  })

  it('字段结构不符时归类为 protocol，提示接口可能升级', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 0, msg: '', data: { unexpected: true } })))
    await expect(provider.currentUser()).rejects.toSatisfy((error: unknown) => isMusicError(error) && error.code === 'protocol')
  })
})

describe('媒体地址', () => {
  it('封面地址带 coverId/size 与鉴权头', () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 0, data: null })))
    const image = provider.image('album_abc', 300)
    expect(image.url).toBe('http://192.168.2.100:5666/music/api/v1/static/cover?coverId=album_abc&size=300')
    expect(image.headers).toEqual({ authorization: 'tok-123' })
  })

  it('播放地址是可 Range 的直推地址，鉴权走请求头（飞牛不支持 query token）', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 0, data: null })))
    const stream = await provider.stream('track-1', { quality: 'original', allowTranscode: false })
    expect(stream.url).toBe('http://192.168.2.100:5666/music/api/v1/track/stream?guid=track-1')
    expect(stream.transport).toBe('progressive')
    expect(stream.headers.authorization).toBe('tok-123')
    expect(stream.url).not.toContain('token=')
  })

  it('未登录时拒绝生成播放地址', async () => {
    const provider = new FnosProvider(connection, { sha256Hex: async () => 'x', deviceId: 'd', fetchImpl: fakeFetch(() => ({})) })
    await expect(provider.stream('t', { quality: 'original', allowTranscode: false })).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'unauthorized',
    )
  })
})

describe('歌词', () => {
  it('按 preferred 选条目，并把服务端 offset 当作偏移带回', async () => {
    let capturedUrl = ''
    const provider = makeProvider(
      fakeFetch((url) => {
        capturedUrl = url
        return {
          code: 0,
          msg: '',
          data: {
            list: [
              { guid: 'ly-1', content: '[00:01.00]第一条', source: 3, isLRC: true, offset: 0 },
              { guid: 'ly-2', content: '[00:02.00]第二条', source: 3, isLRC: true, offset: -320 },
            ],
            preferred: 'ly-2',
          },
        }
      }),
    )

    const sheet = await provider.lyrics('track-1')

    expect(capturedUrl).toBe('http://192.168.2.100:5666/music/api/v1/lyric/list?trackGUID=track-1')
    expect(sheet?.id).toBe('ly-2')
    expect(sheet?.offsetMs).toBe(-320)
    expect(sheet?.lines[0]?.text).toBe('第二条')
  })

  it('没有歌词时返回 null', async () => {
    const provider = makeProvider(fakeFetch(() => ({ code: 0, msg: '', data: { list: [], preferred: null } })))
    await expect(provider.lyrics('track-1')).resolves.toBeNull()
  })
})

describe('上报', () => {
  it('播放上报发 track_play 事件，occurredAt 是起播时刻', async () => {
    let captured: { url: string; body: any } | undefined
    const provider = makeProvider(
      fakeFetch((url, init) => {
        captured = { url, body: JSON.parse(String(init?.body)) }
        return { code: 0, msg: '', data: null }
      }),
    )
    const before = Date.now()

    await provider.reportPlayback({ trackId: 'track-9', positionMs: 5_000, finished: false })

    expect(captured?.url).toBe('http://192.168.2.100:5666/music/api/v1/event/report')
    expect(captured?.body.events).toHaveLength(1)
    const event = captured?.body.events[0]
    expect(event.eventType).toBe('track_play')
    expect(event.payload).toEqual({ trackGUID: 'track-9' })
    // 已播 5 秒 => 起播时刻大约是「现在 - 5 秒」
    expect(event.occurredAt).toBeLessThanOrEqual(before)
    expect(event.occurredAt).toBeGreaterThan(before - 6_000)
  })

  it('歌词偏移写回发 lyric_offset_change，offset 取整毫秒', async () => {
    let body: any
    const provider = makeProvider(
      fakeFetch((_url, init) => {
        body = JSON.parse(String(init?.body))
        return { code: 0, msg: '', data: null }
      }),
    )

    await provider.setLyricOffset({ trackId: 'track-9', lyricId: 'ly-2', offsetMs: 499.6 })

    expect(body.events[0].eventType).toBe('lyric_offset_change')
    expect(body.events[0].payload).toEqual({ trackGUID: 'track-9', lyricGUID: 'ly-2', offset: 500 })
  })
})

describe('转码与 HLS 会话', () => {
  const okTranscode = {
    code: 0,
    msg: '',
    data: {
      status: 'success',
      errno: '',
      errmsg: '',
      hlsTime: 2,
      url: '/music/api/v1/track/hls/track-wma/preset.m3u8',
    },
  }

  it('allowTranscode 为 false 时直推原文件，不发转码请求', async () => {
    const urls: string[] = []
    const provider = makeProvider(
      fakeFetch((url) => {
        urls.push(url)
        return okTranscode
      }),
    )

    const stream = await provider.stream('track-1', { quality: 'original', allowTranscode: false })

    expect(urls).toHaveLength(0)
    expect(stream.transport).toBe('progressive')
    expect(stream.url).toBe('http://192.168.2.100:5666/music/api/v1/track/stream?guid=track-1')
    expect(stream.session).toBeUndefined()
  })

  it('allowTranscode 为 true 时 POST /track/transcode 并返回 HLS 地址', async () => {
    let captured: { url: string; body: any } | undefined
    const provider = makeProvider(
      fakeFetch((url, init) => {
        captured = { url, body: JSON.parse(String(init?.body)) }
        return okTranscode
      }),
    )

    const stream = await provider.stream('track-wma', { quality: 'original', allowTranscode: true })

    expect(captured?.url).toBe('http://192.168.2.100:5666/music/api/v1/track/transcode')
    // 实测：body 只认 guid + output{codec,bitrate,channel}，codec 恒为 flac
    expect(captured?.body).toEqual({ guid: 'track-wma', output: { codec: 'flac', bitrate: 320, channel: 2 } })
    expect(stream.transport).toBe('hls')
    expect(stream.url).toBe('http://192.168.2.100:5666/music/api/v1/track/hls/track-wma/preset.m3u8')
    expect(stream.mimeHint).toBe('application/vnd.apple.mpegurl')
    expect(stream.session?.heartbeatIntervalMs).toBe(10_000)
  })

  it('音质档位映射到 128 / 256 / 320', async () => {
    const bitrates: number[] = []
    const provider = makeProvider(
      fakeFetch((_url, init) => {
        bitrates.push(JSON.parse(String(init?.body)).output.bitrate)
        return okTranscode
      }),
    )

    for (const quality of ['low', 'medium', 'high', 'original'] as const) {
      await provider.stream('track-wma', { quality, allowTranscode: true })
    }

    expect(bitrates).toEqual([128, 256, 320, 320])
  })

  it('status 不是 success/ready 时抛错并带上 errmsg', async () => {
    const provider = makeProvider(
      fakeFetch(() => ({ code: 0, msg: '', data: { status: 'failed', errno: '68157444', errmsg: 'playLink not found' } })),
    )

    await expect(provider.stream('track-wma', { quality: 'original', allowTranscode: true })).rejects.toThrow(
      'playLink not found',
    )
  })

  it('心跳带播放位置（秒）且严格递增，quit 只带 guid', async () => {
    const calls: { url: string; body: any }[] = []
    const provider = makeProvider(
      fakeFetch((url, init) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        return okTranscode
      }),
    )

    const stream = await provider.stream('track-wma', { quality: 'original', allowTranscode: true })
    await stream.session?.heartbeat(1_500)
    // 播放位置卡住不动时也必须递增，否则服务端会判定会话不活跃
    await stream.session?.heartbeat(1_500)
    await stream.session?.close()

    expect(calls[1]?.url).toBe('http://192.168.2.100:5666/music/api/v1/track/transcode/heartbeat')
    expect(calls[1]?.body).toEqual({ guid: 'track-wma', timestamp: 1.5 })
    expect(calls[2]?.body).toEqual({ guid: 'track-wma', timestamp: 1.501 })
    expect(calls[3]?.url).toBe('http://192.168.2.100:5666/music/api/v1/track/transcode/quit')
    expect(calls[3]?.body).toEqual({ guid: 'track-wma' })
  })

  it('心跳返回 failed（任务被回收）时抛 notFound，让上层重开会话', async () => {
    let first = true
    const provider = makeProvider(
      fakeFetch(() => {
        if (first) {
          first = false
          return okTranscode
        }
        return { code: 0, msg: '', data: { status: 'failed', errno: '68157444', errmsg: 'playLink not found' } }
      }),
    )

    const stream = await provider.stream('track-wma', { quality: 'original', allowTranscode: true })
    await expect(stream.session?.heartbeat(1_000)).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'notFound',
    )
  })
})
