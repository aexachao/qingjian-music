/**
 * MP4 / fragmented MP4 的顶层 box 扫描。
 *
 * 用途：校验「服务端 HLS 分片拼接出的单文件」是否完整。
 * 每个媒体分片 = 一个 `moof` + 一个 `mdat`，所以数 `moof` 的个数就是数分片个数 ——
 * 这是抓「丢片 / 重复」的**精确**判据（时长判据抓不到单个丢片，见 `audio-cache-policy.ts`）。
 *
 * 纯逻辑，不 import RN / expo，可直接单测。
 */

export interface Mp4Box {
  type: string
  size: number
  /** box 在 buffer 里的起始偏移 */
  offset: number
}

/**
 * 扫描顶层 box。
 *
 * 遇到尺寸非法或越界的 box 就停下并把 `truncated` 置为 true —— 这正是我们要观察的现象之一
 * （下载被截断的文件就是靠这个发现的），所以**不抛异常**。
 */
export function scanTopLevelBoxes(bytes: Uint8Array): { boxes: Mp4Box[]; truncated: boolean } {
  const boxes: Mp4Box[] = []
  let offset = 0
  while (offset + 8 <= bytes.byteLength) {
    const size =
      ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!)
    if (size < 8 || offset + size > bytes.byteLength) {
      return { boxes, truncated: true }
    }
    boxes.push({ type, size, offset })
    offset += size
  }
  // 尾巴上不足 8 字节的残余也算被截断
  return { boxes, truncated: offset !== bytes.byteLength }
}

/** 数某一种顶层 box 出现的次数 */
export function countBoxes(bytes: Uint8Array, type: string): number {
  return scanTopLevelBoxes(bytes).boxes.filter((box) => box.type === type).length
}

/** 首个顶层 box 的类型（正常产物应是 `ftyp`） */
export function firstBoxType(bytes: Uint8Array): string | undefined {
  return scanTopLevelBoxes(bytes).boxes[0]?.type
}
