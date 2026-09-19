import { describe, expect, it } from 'vitest'
import {
  assertNamespacesDisjoint,
  batchDownloadMessage,
  downloadActionLabel,
  downloadFileName,
  downloadKey,
  downloadPartIndex,
  downloadPartName,
  downloadPartsDirName,
  downloadPercent,
  downloadStateText,
  downloadTranscodeFileName,
  isDownloadName,
  safeExtension,
  summarizeBatch,
} from '../../src/lib/download-policy'

describe('下载的命名空间与缓存分开', () => {
  it('下载文件名有自己的前缀，与缓存名互不混淆', () => {
    const name = downloadFileName('srv', 't1', 'flac')
    expect(name).toBe('dl-srv-t1.flac')
    expect(isDownloadName(name)).toBe(true)
    // 分片是「目录」带前缀（`parts-.../0001.part`），文件名本身只有序号 ——
    // 它永远待在分片目录里，不会跟缓存文件混在同一层
    expect(isDownloadName(downloadPartsDirName('srv', 't1'))).toBe(true)
    expect(isDownloadName(downloadPartName(3))).toBe(false)
    // 播放缓存的名字（`audio-...`）不该被当成下载
    expect(isDownloadName('audio-srv-t1.flac')).toBe(false)
  })

  it('非法字符会被替换，免得当成路径穿越或搞坏文件系统', () => {
    expect(downloadFileName('a/b', 'c:d', 'FLAC')).toBe('dl-a_b-c_d.flac')
    expect(downloadPartIndex('0007.part')).toBe(7)
    expect(downloadPartIndex('7.part')).toBeUndefined()
    expect(downloadPartIndex('0007.tmp')).toBeUndefined()
  })

  it('扩展名兜底：未知格式给 bin，超长的给 bin', () => {
    expect(safeExtension(undefined)).toBe('bin')
    expect(safeExtension('FLAC')).toBe('flac')
    // 畸形/超长的「扩展名」一律当未知：宁可给 .bin 也不要在文件名里塞怪东西
    expect(safeExtension('aac,mp4')).toBe('bin')
    expect(safeExtension('ridiculously-long')).toBe('bin')
  })

  it('转码产物固定 mp4（fMP4 拼出来的整文件）', () => {
    expect(downloadTranscodeFileName('srv', 't1')).toBe('dl-srv-t1.mp4')
  })

  it('分片名补零，字典序就是播放顺序', () => {
    const names = [10, 2, 1].map(downloadPartName).sort()
    expect(names).toEqual(['0001.part', '0002.part', '0010.part'])
  })

  it('下载目录与缓存目录相同会直接抛（不变量）', () => {
    expect(() => assertNamespacesDisjoint('/a/cache', '/a/downloads')).not.toThrow()
    expect(() => assertNamespacesDisjoint('/a/cache', '/a/cache')).toThrow(/必须物理分开/)
  })
})

describe('状态、文案与进度', () => {
  it('菜单动作按状态二选一', () => {
    expect(downloadActionLabel('idle')).toBe('下载')
    expect(downloadActionLabel('failed')).toBe('下载')
    expect(downloadActionLabel('downloading')).toBe('取消下载')
    expect(downloadActionLabel('downloaded')).toBe('删除下载')
  })

  it('状态文案可读', () => {
    expect(downloadStateText('idle')).toBe('未下载')
    expect(downloadStateText('downloading')).toBe('下载中')
    expect(downloadStateText('downloaded')).toBe('已下载')
    expect(downloadStateText('failed')).toBe('下载失败')
  })

  it('进度：total 非法时给 0，且不会超过 100', () => {
    expect(downloadPercent(0, 0)).toBe(0)
    expect(downloadPercent(1, 0)).toBe(0)
    expect(downloadPercent(3, 4)).toBe(75)
    expect(downloadPercent(9, 4)).toBe(100)
    expect(downloadPercent(-1, 4)).toBe(0)
  })

  it('下载键把服务器与曲目都带上（同一曲目在不同服务器是两条）', () => {
    expect(downloadKey('s1', 't1')).toBe('s1:t1')
    expect(downloadKey('s2', 't1')).not.toBe(downloadKey('s1', 't1'))
  })
})

describe('下载接线（源码断言，防止被顺手改断）', () => {
  it('菜单里有「下载 / 删除下载」，且按状态二选一', async () => {
    const { readSource } = await import('../support/source')
    const menu = readSource('lib/track-menu.ts')
    expect(menu).toContain("'download': '下载'")
    expect(menu).toContain("'remove-download': '删除下载'")
    expect(menu).toContain("ids.push(capabilities.isDownloaded ? 'remove-download' : 'download')")
  })

  it('播放解析**先查下载**：下过的歌不再走网络', async () => {
    const { readSource } = await import('../support/source')
    const controller = readSource('player/controller.ts')
    const downloadCheck = controller.indexOf('downloadedUri(item.serverId, item.trackId)')
    const cacheCheck = controller.indexOf('cachedAudioUri(toCacheTarget(item))')
    expect(downloadCheck).toBeGreaterThanOrEqual(0)
    // 下载优先于播放缓存：下载是用户显式要的，缓存只是加速
    expect(downloadCheck).toBeLessThan(cacheCheck)
  })

  it('多选动作栏的「下载」不再是空实现', async () => {
    const { readSource, hasNoCode } = await import('../support/source')
    const bar = readSource('components/selection-bar.tsx')
    expect(bar).toContain('onPress: onDownload')
    expect(hasNoCode('components/selection-bar.tsx', 'enabled: !disabled && downloadEnabled')).toBe(true)
    expect(readSource('lib/use-track-selection.ts')).toContain('downloadSelected')
  })

  it('下载目录与缓存目录分开（架构不变量）', async () => {
    const { readSource } = await import('../support/source')
    const downloads = readSource('player/downloads.ts')
    expect(downloads).toContain("const DOWNLOAD_DIR = 'downloads'")
    expect(downloads).toContain('assertNamespacesDisjoint(CACHE_DIR, DOWNLOAD_DIR)')
  })

  it('需转码的曲目走 HLS 拼接而不是直接报错', async () => {
    const { readSource } = await import('../support/source')
    const downloads = readSource('player/downloads.ts')
    // requiresTranscode 不再直接 throw，而是走专门的转码下载函数
    expect(downloads).toContain('await downloadTranscodeTrack(')
    // 转码下载必须开心跳保活（断了分片会 410）
    expect(downloads).toContain('session.heartbeat(')
    expect(downloads).toContain('session.heartbeatIntervalMs')
    // 产物要校验 moof/mdat 配平，不能拼出个坏文件就登记
    expect(downloads).toContain('validateTranscodeProduct(')
    // 无论成败都关会话，不在服务端堆转码进程
    expect(downloads).toContain('session.close()')
  })

  it('转码产物播放用登记的 contentType（fMP4 不能按原格式查）', async () => {
    const { readSource } = await import('../support/source')
    const controller = readSource('player/controller.ts')
    // 下载优先分支里，转码产物的 contentType 优先于按 format 兜底
    expect(controller).toContain('downloadedContentType(item.serverId, item.trackId) ?? contentTypeFor(item.format)')
  })

  it('Android 原生下载已接上（不再只回退 JS）', async () => {
    const { readPackageFile } = await import('../support/source')
    // 模块声明了 android 平台与 Kotlin 模块类
    const config = readPackageFile('modules/audio-downloader/expo-module.config.json')
    expect(config).toContain('"android"')
    expect(config).toContain('expo.modules.audiodownloader.AudioDownloaderModule')
    // JS 侧 hasNativeDownloader 不再把 Android 排除
    const index = readPackageFile('modules/audio-downloader/index.ts')
    expect(index).toContain("Platform.OS === 'ios' || Platform.OS === 'android'")
    // Kotlin 侧：用 DownloadManager、多 URL（转码）返回 false 让 JS 回退
    const session = readPackageFile(
      'modules/audio-downloader/android/src/main/java/expo/modules/audiodownloader/AudioDownloaderSession.kt',
    )
    expect(session).toContain('DownloadManager')
    expect(session).toContain('if (job.urls.size != 1) return false')
  })
})

describe('批量下载的结果汇总：失败要说失败', () => {
  it('全成功', () => {
    const result = summarizeBatch([
      { trackId: 'a', ok: true },
      { trackId: 'b', ok: true },
    ])
    expect(result).toEqual({ started: 2, failed: [] })
    expect(batchDownloadMessage(result)).toBe('已开始下载 2 首')
  })

  it('部分失败：两边都报', () => {
    const result = summarizeBatch([
      { trackId: 'a', ok: true },
      { trackId: 'b', ok: false, reason: '空间不足' },
    ])
    expect(result.started).toBe(1)
    expect(result.failed).toEqual([{ trackId: 'b', reason: '空间不足' }])
    expect(batchDownloadMessage(result)).toBe('已开始下载 1 首，1 首失败')
  })

  it('全失败：带上第一条原因（没有原因也不能说成功）', () => {
    const result = summarizeBatch([{ trackId: 'a', ok: false }])
    expect(result.started).toBe(0)
    expect(batchDownloadMessage(result)).toBe('1 首下载失败：未知原因')
  })

  it('空集合不说「已开始下载 0 首」', () => {
    expect(batchDownloadMessage(summarizeBatch([]))).toBe('没有可下载的曲目')
  })
})
