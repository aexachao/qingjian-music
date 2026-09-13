#!/usr/bin/env node
/**
 * 列出飞牛音乐库里实际存在的音频格式分布，并给出可直接使用的测试 guid。
 *
 * 用途：回答两个问题 ——
 *   1. 我这套曲库里到底有哪些格式？哪些会走服务端转码？
 *   2. 我要测转码，该拿哪几首？guid 是多少？
 *
 * 用法：
 *   FNOS_BASE=http://192.168.2.100:5666 FNOS_TOKEN=<token> \
 *     node scripts/spike/list-formats.ts
 *
 * 判定逻辑**直接复用 App 的实现**（`format-support.ts` 的白名单、`endpoints.ts` 的端点表），
 * 所以脚本给出的「是否需要转码」与 App 内的判断一致，不会两处漂移。
 *
 * 注意：`/track/list` 需要登录态；token 拿法见 scripts/spike/README.md。
 */

import { FNOS_API_PREFIX, FNOS_ENDPOINTS } from '../../packages/provider-fnos/src/endpoints.ts'
import { needsTranscode } from '../../apps/mobile/src/player/format-support.ts'

/** 每页条数：太小会很慢，太大可能被服务端截断 */
const PAGE_SIZE = 200
/** 安全上限，防止服务端 total 异常导致无限翻页 */
const MAX_PAGES = 200

interface RawAudioSpec {
  codec?: string | null
  format?: string | null
  container?: string | null
  bitrate?: number | null
  sampleRate?: number | null
  bitDepth?: number | null
  channel?: number | null
  channels?: number | null
  duration?: number | null
  size?: number | null
  path?: string | null
}

interface RawTrack {
  guid: string
  title?: string | null
  isCue?: boolean | null
  duration?: number | null
  audioSpec?: RawAudioSpec | null
}

/**
 * 与 `player/controller.ts` 的 `toQueueItem` 保持一致的回退链：
 * format → container → codec → 文件路径后缀。
 * 不一致的话，脚本统计出来的格式会和实际播放时判定用的格式对不上。
 */
function resolveFormat(track: RawTrack): string {
  const spec = track.audioSpec
  const fromPath = spec?.path ? spec.path.split('.').pop() : undefined
  const raw = spec?.format || spec?.container || spec?.codec || fromPath || ''
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface Bucket {
  format: string
  count: number
  bytes: number
  example: RawTrack
}

async function main(): Promise<void> {
  const base = process.env.FNOS_BASE
  const token = process.env.FNOS_TOKEN
  if (!base || !token) {
    throw new Error('缺少 FNOS_BASE 或 FNOS_TOKEN 环境变量（token 拿法见 scripts/spike/README.md）')
  }
  const root = `${base.replace(/\/+$/, '')}${FNOS_API_PREFIX}`
  const headers = { authorization: token, 'content-type': 'application/json' }

  const buckets = new Map<string, Bucket>()
  let total: number | undefined
  let scanned = 0

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`${root}${FNOS_ENDPOINTS.track.list}`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('size', String(PAGE_SIZE))

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
    const text = await response.text()
    if (!response.ok) throw new Error(`GET /track/list → HTTP ${response.status}: ${text.slice(0, 200)}`)
    const envelope = JSON.parse(text) as { code: number; msg?: string; data?: { list?: RawTrack[]; total?: number } }
    if (envelope.code !== 0) throw new Error(`GET /track/list → code ${envelope.code}: ${envelope.msg ?? ''}`)

    const list = envelope.data?.list ?? []
    if (typeof envelope.data?.total === 'number') total = envelope.data.total
    if (list.length === 0) break

    for (const track of list) {
      const format = resolveFormat(track)
      const existing = buckets.get(format)
      const size = track.audioSpec?.size ?? 0
      if (existing) {
        existing.count += 1
        existing.bytes += size
      } else {
        buckets.set(format, { format, count: 1, bytes: size, example: track })
      }
    }
    scanned += list.length
    if (total !== undefined && scanned >= total) break
    if (list.length < PAGE_SIZE) break
  }

  if (buckets.size === 0) {
    console.log('没有扫描到任何曲目（检查 token / 库权限）。')
    return
  }

  const rows = [...buckets.values()].sort((a, b) => b.count - a.count)
  const grandTotal = rows.reduce((sum, row) => sum + row.count, 0)

  console.log(`\n扫描到 ${grandTotal} 首${total !== undefined ? `（服务端 total=${total}）` : ''}\n`)
  console.log('格式       数量    占比      需转码  示例')
  console.log('─'.repeat(78))
  for (const row of rows) {
    const label = row.format || '(未知)'
    const percent = ((row.count / grandTotal) * 100).toFixed(1)
    const transcode = needsTranscode(row.format) ? '是' : '否'
    const title = (row.example.title ?? '').slice(0, 22)
    console.log(
      `${label.padEnd(9)}  ${String(row.count).padStart(5)}  ${percent.padStart(5)}%   ${transcode.padEnd(5)}   ${title}`,
    )
  }

  const transcoding = rows.filter((row) => needsTranscode(row.format))
  const transcodingCount = transcoding.reduce((sum, row) => sum + row.count, 0)

  console.log('\n需要服务端转码的格式（按数量排序）：')
  if (transcoding.length === 0) {
    console.log('  无 —— 你的库里所有格式原生都能播，转码路径不会被触发。')
  } else {
    for (const row of transcoding) {
      const spec = row.example.audioSpec
      const detail = [
        spec?.codec ? `codec=${spec.codec}` : '',
        spec?.channel ? `ch=${spec.channel}` : '',
        spec?.sampleRate ? `${spec.sampleRate}Hz` : '',
        spec?.size ? `${(spec.size / 1024 / 1024).toFixed(1)}MB` : '',
      ]
        .filter(Boolean)
        .join(' ')
      console.log(`  ${row.format.padEnd(6)} ${String(row.count).padStart(5)} 首   ${detail}`)
    }
    console.log(`  合计 ${transcodingCount} 首，占 ${((transcodingCount / grandTotal) * 100).toFixed(1)}%`)
  }

  // 直接给出可复制运行的命令，省掉手工拼 guid
  console.log('\n可以直接跑转码验证的样本（每格式取一首）：')
  console.log('─'.repeat(78))
  for (const row of transcoding) {
    console.log(`# ${row.format}  ${row.example.title ?? ''}`)
    console.log(
      `FNOS_BASE=$FNOS_BASE FNOS_TOKEN=$FNOS_TOKEN node scripts/spike/transcode-concat.ts remote ` +
        `${row.example.guid} /tmp/qj-spike/real-${row.format}.mp4`,
    )
  }

  console.log('\n另外建议挑一首「原生可播」的做对照（确认正常路径没被改坏），例如：')
  const native = rows.find((row) => !needsTranscode(row.format))
  if (native) console.log(`  ${native.format}: ${native.example.title ?? ''}  guid=${native.example.guid}`)
}

main().catch((error: unknown) => {
  console.error('[list-formats] 失败:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
