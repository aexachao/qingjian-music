import { describe, expect, it } from 'vitest'
import {
  type CacheEntry,
  cacheFileName,
  contentTypeFor,
  formatBytes,
  pickEvictions,
  safeExtension,
  totalBytes,
  TRANSCODE_CACHE_FORMAT,
  transcodeCacheFileName,
  validateTranscodeProduct,
} from '../../src/player/audio-cache-policy'

describe('缓存文件名', () => {
  it('用服务器 id + 曲目 id + 真实后缀，非法字符会被替换', () => {
    expect(cacheFileName('srv-1', 'abc123', 'flac')).toBe('srv-1_abc123.flac')
    expect(cacheFileName('srv/1', 'a b', 'MP3')).toBe('srv_1_a_b.mp3')
  })

  it('格式缺失或异常时退回 audio 后缀', () => {
    expect(safeExtension(undefined)).toBe('audio')
    expect(safeExtension('')).toBe('audio')
    expect(safeExtension('toolongformat')).toBe('audio')
    expect(cacheFileName('s', 't')).toBe('s_t.audio')
  })

  it('已知格式给出 contentType，未知的不给', () => {
    expect(contentTypeFor('flac')).toBe('audio/flac')
    expect(contentTypeFor('mp3')).toBe('audio/mpeg')
    expect(contentTypeFor('ape')).toBeUndefined()
  })
})

describe('转码产物的缓存后缀', () => {
  /**
   * 回归防线：实测（同一份 fMP4+FLAC 字节改成不同后缀，用 AVFoundation 验证）
   * `.wma` / `.ape` / `.dsf` / `.dff` / `.wv` / `.tak` / `.tta` 全部 `isPlayable = false`，
   * 而这些**恰好就是需要转码的那组格式**。
   * 所以转码产物一旦沿用源格式后缀，就是「内容正确但必然播不出来」。
   */
  it('必须用 mp4 后缀，不能沿用源格式后缀', () => {
    expect(TRANSCODE_CACHE_FORMAT).toBe('mp4')
    // 用源格式后缀会得到 AVFoundation 明确拒绝播放的名字
    for (const sourceFormat of ['wma', 'ape', 'dsf', 'dff', 'wv', 'tak', 'tta']) {
      expect(cacheFileName('s', 't', sourceFormat)).not.toBe(transcodeCacheFileName('s', 't'))
    }
  })

  it('转码产物与原始文件用不同后缀，可以共存不互相覆盖', () => {
    expect(transcodeCacheFileName('srv', 'track')).toBe('srv_track.mp4')
    expect(cacheFileName('srv', 'track', 'wma')).toBe('srv_track.wma')
    expect(transcodeCacheFileName('srv', 'track')).not.toBe(cacheFileName('srv', 'track', 'wma'))
  })

  it('mp4 后缀能给出正确的 contentType（AVPlayer 靠它 + 后缀判断容器）', () => {
    expect(contentTypeFor(TRANSCODE_CACHE_FORMAT)).toBe('audio/mp4')
  })
})

describe('LRU 淘汰', () => {
  const entries: CacheEntry[] = [
    { key: 'a', size: 100, lastUsedAt: 1 },
    { key: 'b', size: 100, lastUsedAt: 2 },
    { key: 'c', size: 100, lastUsedAt: 3 },
  ]

  it('没超配额就不删任何东西', () => {
    expect(totalBytes(entries)).toBe(300)
    expect(pickEvictions(entries, 1_000, 100)).toEqual([])
  })

  it('超了就从最久未用的开始删，够了就停', () => {
    // 配额 300、已用 300，再进 100 就要腾出 100 => 只删最老的 a
    expect(pickEvictions(entries, 300, 100)).toEqual(['a'])
    // 要腾出 150 => a 不够，接着删 b
    expect(pickEvictions(entries, 300, 150)).toEqual(['a', 'b'])
    // 要腾出的比全部缓存还多时，全删（也只能全删）
    expect(pickEvictions(entries, 300, 400)).toEqual(['a', 'b', 'c'])
  })

  it('受保护的条目绝不删（正在播放/马上要播的那几首）', () => {
    expect(pickEvictions(entries, 300, 100, new Set(['a']))).toEqual(['b'])
    expect(pickEvictions(entries, 100, 100, new Set(['a', 'b', 'c']))).toEqual([])
  })

  it('容量为 0 时表示不设容量上限', () => {
    expect(pickEvictions(entries, 0, 10_000)).toEqual([])
  })

  it('首数超限时按最久未用淘汰多余条目', () => {
    // 现有 3 首歌，上限设为 2 首，主动检查（incomingBytes=0）淘汰最老的 a
    expect(pickEvictions(entries, 0, 0, new Set(), 2)).toEqual(['a'])
    // 现有 3 首歌，上限设为 2 首，新进一首（incomingBytes>0），需要保留 2 首，因此淘汰最老的 2 首（a, b）
    expect(pickEvictions(entries, 0, 100, new Set(), 2)).toEqual(['a', 'b'])
    // 上限设为 3 首，新进一首（总共将有 4 首），需要淘汰 1 首
    expect(pickEvictions(entries, 0, 100, new Set(), 3)).toEqual(['a'])
    // 受保护的即使超限也不淘汰
    expect(pickEvictions(entries, 0, 0, new Set(['a']), 2)).toEqual(['b'])
  })
})

describe('体积展示', () => {
  it('按 GB / MB / KB 取整', () => {
    expect(formatBytes(0)).toBe('0 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
    expect(formatBytes(700 * 1024 ** 2)).toBe('700 MB')
    expect(formatBytes(2048)).toBe('2 KB')
  })
})

describe('转码产物完整性校验', () => {
  /** 正常产物：96 个分片、时长与源一致 */
  const normal = {
    moofCount: 96,
    mdatCount: 96,
    nonEmptySegmentCount: 96,
    actualDurationSeconds: 191.1,
    sourceDurationSeconds: 191.104,
  }

  it('正常产物通过', () => {
    expect(validateTranscodeProduct(normal)).toEqual({ ok: true })
  })

  it('空分片是合法的（音频正好落在分片边界上）', () => {
    // 实测 ffmpeg 样本：16 片里尾片只有 24 字节、不含 moof
    expect(
      validateTranscodeProduct({
        moofCount: 15,
        mdatCount: 15,
        nonEmptySegmentCount: 15,
        actualDurationSeconds: 30.0,
        sourceDurationSeconds: 30.104,
      }),
    ).toEqual({ ok: true })
  })

  it('拿不到产物时长时跳过时长校验，不因此判失败', () => {
    expect(validateTranscodeProduct({ ...normal, actualDurationSeconds: undefined })).toEqual({ ok: true })
  })

  it('没有任何分片时失败', () => {
    const result = validateTranscodeProduct({ ...normal, moofCount: 0, mdatCount: 0, nonEmptySegmentCount: 0 })
    expect(result.ok).toBe(false)
  })

  it('moof/mdat 不配平说明文件被截断', () => {
    const result = validateTranscodeProduct({ ...normal, mdatCount: 95 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('截断')
  })

  it('丢片或重复时靠分片计数抓到', () => {
    // 漏了 1 片：产物 95 片，但下载到的非空分片是 96 片
    const result = validateTranscodeProduct({ ...normal, moofCount: 95, mdatCount: 95 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('分片数不一致')
  })

  it('顺序错误靠时长抓到（分片计数看不出来）', () => {
    // 倒序：分片数与配平都正常，但时长从 30s 变成 2s
    const result = validateTranscodeProduct({
      moofCount: 15,
      mdatCount: 15,
      nonEmptySegmentCount: 15,
      actualDurationSeconds: 2.09,
      sourceDurationSeconds: 30.104,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('时长偏差过大')
  })

  it('服务端重采样导致的 ~1% 时长偏差不能误判为失败', () => {
    // 实测：dsf 源 233.731s，服务端重采样成非整数比采样率后产物 232.085s（差 1.65s）
    // 容差是 max(2s, 源时长 2%) = 4.67s，所以应通过
    expect(
      validateTranscodeProduct({
        moofCount: 117,
        mdatCount: 117,
        nonEmptySegmentCount: 117,
        actualDurationSeconds: 232.085,
        sourceDurationSeconds: 233.731,
      }),
    ).toEqual({ ok: true })
  })

  it('单个丢片在长曲目里时长抓不到，但分片计数能抓到', () => {
    // 240s 曲目漏一片 2s：时长只差 0.8%（容差 4.8s 内），但计数对不上
    const result = validateTranscodeProduct({
      moofCount: 119,
      mdatCount: 119,
      nonEmptySegmentCount: 120,
      actualDurationSeconds: 238,
      sourceDurationSeconds: 240,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('分片数不一致')
  })

  it('短样本用 2 秒的绝对容差下限', () => {
    // 30 秒样本：2% = 0.6s，但下限是 2s，所以 1.5s 偏差应通过
    expect(
      validateTranscodeProduct({
        moofCount: 15,
        mdatCount: 15,
        nonEmptySegmentCount: 15,
        actualDurationSeconds: 28.6,
        sourceDurationSeconds: 30.1,
      }),
    ).toEqual({ ok: true })
  })
})
