#!/usr/bin/env node
/**
 * Spike：把服务端转码产物（HLS）拼接成一个可本地播放的单文件。
 *
 * 目的：验证 `docs/方案评估-本地解码-vs-服务端转码-2026-09-13.md` §5 提出的
 * 「缓存转码产物」方案在技术上是否成立 —— 如果成立，就能用纯 JS 解决
 * 「NAS 每次播放都重复转码」和「不可播格式没有离线」两个问题，不必引入 FFmpeg。
 *
 * 用法
 * ────
 *   # 1) 本地机制验证（不需要服务器）：拿一个 HLS 目录，拼接并检查产物
 *   node scripts/spike/transcode-concat.ts local <hls目录> <输出文件>
 *   node scripts/spike/transcode-concat.ts local <hls目录> <输出文件> --no-init   # 负面对照
 *   node scripts/spike/transcode-concat.ts local <hls目录> <输出文件> --reverse   # 负面对照
 *
 *   # 2) 真实服务器验证（需要局域网可达 + 登录 token）
 *   FNOS_BASE=http://192.168.2.100:5666 FNOS_TOKEN=<token> \
 *     node scripts/spike/transcode-concat.ts remote <trackGuid> <输出文件>
 *
 * 负面对照是刻意留的：一个「永远通过」的验证等于没有验证。
 * 先跑 --no-init / --reverse 确认检查能报错，再跑正常路径确认能通过。
 *
 * 这是一个 spike 脚本，不是生产代码：端点字符串在这里硬编码了一份
 * （生产实现必须走 `packages/provider-fnos/src/endpoints.ts`）。
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseHlsPlaylist } from '../../apps/mobile/src/player/hls-playlist.ts'

const API_PREFIX = '/music/api/v1'
/** 与 web 端实测一致：转码 POST 20s、心跳/quit 3s */
const TRANSCODE_TIMEOUT_MS = 20_000
const SESSION_TIMEOUT_MS = 3_000
/** 服务端按 10s 心跳判活，断掉约 1 分钟后回收任务（分片开始 410） */
const HEARTBEAT_MS = 10_000
/**
 * 分片重试。
 *
 * **实测发现（2026-09-13，真实服务器）**：`POST /track/transcode` 返回
 * `status: 'success'` **只代表任务已建**，分片可能还没生成 —— 此时请求分片会拿到 **404**。
 * 现象很迷惑：播放列表能正常取到、`init.mp4` 也能取到，就是首个分片 404。
 *
 * 触发条件是「源文件解码/编码越重越容易踩到」：实测 `wma`（7MB）几乎不失败，
 * 而 `dsf`（DSD256，314MB）稳定复现；等待约 2 秒后即全部 200。
 * 注意区分：**404 = 还没生成（可重试）**，**410 = 任务被回收（重开会话才有意义）**。
 */
const SEGMENT_RETRY_ATTEMPTS = 8
const SEGMENT_RETRY_DELAY_MS = 1_000

function log(...args: unknown[]): void {
  console.log('[spike]', ...args)
}

/**
 * 取一个分片，对「还没生成」的情况做有界重试。
 * 404 = 服务端还在转码这一片（可重试）；410 = 任务被回收（重试无用，但要报清楚）。
 */
async function fetchSegment(url: string, headers: Record<string, string>, label: string): Promise<Buffer> {
  let lastStatus = 0
  for (let attempt = 1; attempt <= SEGMENT_RETRY_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) })
    if (response.ok) return Buffer.from(await response.arrayBuffer())
    lastStatus = response.status
    if (response.status !== 404 && response.status !== 410) {
      throw new Error(`${label} HTTP ${response.status}`)
    }
    if (attempt < SEGMENT_RETRY_ATTEMPTS) {
      if (attempt === 1) log(`    ${label} 返回 ${response.status}（分片尚未生成），等待重试…`)
      await new Promise((resolve) => setTimeout(resolve, SEGMENT_RETRY_DELAY_MS * attempt))
    }
  }
  throw new Error(
    `${label} HTTP ${lastStatus}（重试 ${SEGMENT_RETRY_ATTEMPTS} 次仍未就绪）` +
      (lastStatus === 410 ? '：任务已被回收，需要重新发起转码' : ''),
  )
}

/** 只扫顶层 box，够用来确认 ftyp/moov/moof/mdat 结构 */
function scanBoxes(buffer: Buffer): Record<string, number> {
  const counts: Record<string, number> = {}
  let offset = 0
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    if (size < 8 || offset + size > buffer.length) {
      // 最后一个 box 可能被截断；记录后停止，不抛错（这正是我们要观察的现象之一）
      counts[`${type}(truncated)`] = (counts[`${type}(truncated)`] ?? 0) + 1
      break
    }
    counts[type] = (counts[type] ?? 0) + 1
    // moov / trak 等容器 box 不递归展开：我们只需要顶层结构
    offset += size
  }
  return counts
}

interface SegmentPart {
  name: string
  bytes: Buffer
}

function report(outputPath: string, bytes: Buffer, segmentParts?: SegmentPart[]): void {
  const boxes = scanBoxes(bytes)
  const startsWithFtyp = bytes.length >= 8 && bytes.toString('latin1', 4, 8) === 'ftyp'
  log('产物:', outputPath)
  log('体积:', bytes.length, 'bytes')
  log('首个 box 是 ftyp:', startsWithFtyp)
  log('顶层 box 统计:', boxes)
  const moof = boxes.moof ?? 0
  const mdat = boxes.mdat ?? 0
  log(`moof/mdat 对数: ${moof}/${mdat}`, moof > 0 && moof === mdat ? '(配平)' : '(不配平!)')

  /**
   * **分片计数是拼接完整性的主判据**（每个媒体分片 = 一个 `moof` + 一个 `mdat`）。
   *
   * 两个必须注意的点，都是实测踩出来的：
   *
   * 1. **空分片是合法的**：音频正好落在分片边界上时，服务端/ffmpeg 会产出一个
   *    只含 `styp`、没有 `moof` 的尾片。所以判据是「产物 moof 数 == **非空**分片数」，
   *    直接拿播放列表分片数比会误报失败。
   * 2. **不要用时长当主判据**：服务端对某些源（如 DSD256）会重采样到非整数比的目标
   *    采样率，产物时长比源短约 1%，这不是拼接错误；反过来漏一个 2 秒分片在 4 分钟
   *    曲目里只占 0.8%，宽松的时长阈值又抓不住。
   *
   * 另外要清楚这个判据**抓不到顺序错误**（倒序时分片数不变）—— 顺序靠时长比对和
   * AVFoundation 播放验证兜住。
   */
  if (segmentParts) {
    const empty = segmentParts.filter((part) => (scanBoxes(part.bytes).moof ?? 0) === 0)
    const nonEmpty = segmentParts.length - empty.length
    const ok = moof === nonEmpty && mdat === nonEmpty
    log(
      `分片: 共 ${segmentParts.length} 片，非空 ${nonEmpty} 片，产物 moof/mdat = ${moof}/${mdat} → ` +
        (ok ? '✅ 一致（未丢片、未重复）' : '❌ 不一致（拼接有问题）'),
    )
    if (empty.length) {
      log(
        `  其中 ${empty.length} 片为空（${empty.map((part) => part.name).join(', ')}）` +
          '：音频正好落在分片边界上是正常现象，不是错误',
      )
    }
  }
  if (!startsWithFtyp) log('⚠️ 文件不以 ftyp 开头 —— 播放器大概率不认')
  if (boxes['moov(truncated)'] || boxes['mdat(truncated)']) log('⚠️ 存在被截断的 box')
}

// ── 本地模式：验证「拼接」这个机制本身 ──────────────────────────────────────

async function runLocal(hlsDir: string, outputPath: string, options: { skipInit: boolean; reverse: boolean }): Promise<void> {
  const playlistPath = join(hlsDir, 'preset.m3u8')
  const text = await readFile(playlistPath, 'utf8')
  // 用 file:// 作为基准地址，解析结果再转回本地路径
  const playlist = parseHlsPlaylist(text, pathToFileURL(playlistPath).toString())

  log('解析结果: init =', playlist.initUri ? basename(fileURLToPath(playlist.initUri)) : '(无)')
  log('分片数:', playlist.segmentUris.length, '| 播放列表总时长:', playlist.durationSeconds, '秒')
  log('是完整点播列表:', playlist.isComplete)

  if (!playlist.isComplete) {
    throw new Error('播放列表没有 #EXT-X-ENDLIST，拼接结果不完整，放弃（这正是生产实现该有的行为）')
  }

  const parts: Buffer[] = []
  if (playlist.initUri && !options.skipInit) {
    parts.push(await readFile(fileURLToPath(playlist.initUri)))
  }
  const ordered = options.reverse ? [...playlist.segmentUris].reverse() : playlist.segmentUris
  const segmentParts: SegmentPart[] = []
  for (const uri of ordered) {
    const segmentBytes = await readFile(fileURLToPath(uri))
    parts.push(segmentBytes)
    segmentParts.push({ name: basename(uri), bytes: segmentBytes })
  }

  const bytes = Buffer.concat(parts)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, bytes)
  report(outputPath, bytes, segmentParts)
}

// ── 远程模式：对着真实服务器走完整流程 ─────────────────────────────────────

interface RemoteOptions {
  base: string
  token: string
  trackId: string
  outputPath: string
}

async function runRemote({ base, token, trackId, outputPath }: RemoteOptions): Promise<void> {
  const root = `${base.replace(/\/+$/, '')}${API_PREFIX}`
  const headers = { authorization: token, 'content-type': 'application/json' }

  async function post(path: string, body: unknown, timeoutMs: number): Promise<any> {
    const response = await fetch(`${root}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`POST ${path} → HTTP ${response.status}: ${text.slice(0, 200)}`)
    const envelope = JSON.parse(text) as { code: number; msg?: string; data?: any }
    if (envelope.code !== 0) throw new Error(`POST ${path} → code ${envelope.code}: ${envelope.msg ?? ''}`)
    return envelope.data
  }

  log('1/5 发起转码…')
  const started = Date.now()
  const data = await post(
    '/track/transcode',
    { guid: trackId, output: { codec: 'flac', bitrate: 320, channel: 2 } },
    TRANSCODE_TIMEOUT_MS,
  )
  const status = String(data?.status ?? '').toLowerCase()
  if (status !== 'success' && status !== 'ready') {
    throw new Error(`转码未成功：status=${data?.status} errmsg=${data?.errmsg ?? ''}`)
  }
  log('    status =', data?.status)

  // 心跳：**必须在下载期间持续发送**。断掉约一分钟后服务端会回收任务，
  // 后续分片请求会开始返回 410 —— 这是这个方案最容易踩的坑。
  let lastSeconds = -1
  const heartbeat = setInterval(() => {
    const seconds = (Date.now() - started) / 1000
    const timestamp = seconds > lastSeconds ? seconds : lastSeconds + 0.001
    lastSeconds = timestamp
    void post('/track/transcode/heartbeat', { guid: trackId, timestamp: Number(timestamp.toFixed(3)) }, SESSION_TIMEOUT_MS)
      .then((beat) => {
        if (String(beat?.status ?? '').toLowerCase() === 'failed') {
          console.warn('[spike] ⚠️ 心跳返回 failed：任务已被回收')
        }
      })
      .catch((error: unknown) => console.warn('[spike] 心跳失败（瞬时错误可忽略）:', String(error)))
  }, HEARTBEAT_MS)

  try {
    const playlistUrl = data?.url
      ? new URL(data.url, `${base.replace(/\/+$/, '')}/`).toString()
      : `${root}/track/hls/${encodeURIComponent(trackId)}/preset.m3u8`

    log('2/5 拉取播放列表:', playlistUrl)
    const playlistResponse = await fetch(playlistUrl, { headers, signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) })
    if (!playlistResponse.ok) throw new Error(`播放列表 HTTP ${playlistResponse.status}`)
    const playlist = parseHlsPlaylist(await playlistResponse.text(), playlistUrl)
    log('    分片数:', playlist.segmentUris.length, '| 总时长:', playlist.durationSeconds, '秒')
    if (!playlist.isComplete) throw new Error('不是完整点播列表（无 #EXT-X-ENDLIST），放弃缓存')

    log('3/5 下载 init + 分片…')
    const parts: Buffer[] = []
    const segmentParts: SegmentPart[] = []
    if (playlist.initUri) {
      parts.push(await fetchSegment(playlist.initUri, headers, '初始化分片 init'))
    }
    const total = playlist.segmentUris.length
    for (const [index, uri] of playlist.segmentUris.entries()) {
      const name = uri.slice(uri.lastIndexOf('/') + 1)
      const segmentBytes = await fetchSegment(uri, headers, `分片 ${index}/${total}（${name}）`)
      parts.push(segmentBytes)
      segmentParts.push({ name, bytes: segmentBytes })
      if (index % 5 === 0 || index === total - 1) log(`    ${index + 1}/${total}`)
    }

    const bytes = Buffer.concat(parts)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, bytes)
    log('4/5 已写出')
    report(outputPath, bytes, segmentParts)

    log('5/5 通知服务端结束转码')
    await post('/track/transcode/quit', { guid: trackId }, SESSION_TIMEOUT_MS).catch((error: unknown) =>
      console.warn('[spike] quit 失败（不致命，服务端会按心跳超时自行回收）:', String(error)),
    )
    log('完成。接下来用 ffprobe / 真机播放验证这个文件。')
  } finally {
    clearInterval(heartbeat)
  }
}

async function main(): Promise<void> {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode === 'local') {
    const [hlsDir, outputPath] = rest
    if (!hlsDir || !outputPath) throw new Error('用法: local <hls目录> <输出文件> [--no-init|--reverse]')
    await stat(join(hlsDir, 'preset.m3u8')).catch(() => {
      throw new Error(`${hlsDir} 下没有 preset.m3u8`)
    })
    await runLocal(hlsDir, outputPath, {
      skipInit: rest.includes('--no-init'),
      reverse: rest.includes('--reverse'),
    })
    return
  }
  if (mode === 'remote') {
    const [trackId, outputPath] = rest
    const base = process.env.FNOS_BASE
    const token = process.env.FNOS_TOKEN
    if (!trackId || !outputPath) throw new Error('用法: remote <trackGuid> <输出文件>（并设置 FNOS_BASE / FNOS_TOKEN）')
    if (!base || !token) throw new Error('缺少 FNOS_BASE 或 FNOS_TOKEN 环境变量')
    await runRemote({ base, token, trackId, outputPath })
    return
  }
  throw new Error('用法: transcode-concat.ts <local|remote> …')
}

main().catch((error: unknown) => {
  console.error('[spike] 失败:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
