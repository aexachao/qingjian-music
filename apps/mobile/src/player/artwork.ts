import { Directory, File, Paths } from 'expo-file-system'
import type { HttpResource } from '@qj/core-domain'
import { fetchBoundedBytes } from '@/lib/bounded-fetch'

/**
 * 锁屏封面必须是本地文件：RNTP 的 artwork 只接受 URL，不能带鉴权头，
 * 而飞牛的封面接口必须带头，所以先下载到缓存目录再交给播放器。
 */
const ARTWORK_DIR = 'artwork'
const MAX_ARTWORK_BYTES = 40 * 1024 * 1024
const MAX_ARTWORK_FILES = 128
const MAX_ARTWORK_FILE_BYTES = 8 * 1024 * 1024
const MAX_PARALLEL_ARTWORK_DOWNLOADS = 2

function artworkDir(): Directory {
  const dir = new Directory(Paths.cache, ARTWORK_DIR)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

const inflight = new Map<string, Promise<string | undefined>>()
const controllers = new Map<string, AbortController>()
// Hits are LRU within this runtime; modification time provides a restart fallback.
const lastAccess = new Map<string, number>()
let artworkGeneration = 0

function toMillis(value: number | null | undefined): number {
  if (!value || value <= 0) return 0
  return value < 1e12 ? value * 1000 : value
}

function fileNameForKey(key: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ (code + index), 0x85ebca6b)
  }
  return `art_${(first >>> 0).toString(36)}_${(second >>> 0).toString(36)}.img`
}

function makeRoom(incomingBytes: number, targetName: string): boolean {
  if (incomingBytes > MAX_ARTWORK_FILE_BYTES || incomingBytes > MAX_ARTWORK_BYTES) return false
  let files: File[]
  try {
    files = artworkDir().list().filter((item): item is File => item instanceof File)
  } catch {
    return false
  }
  const existing = files.find((file) => file.name === targetName)
  const candidates = files
    .filter((file) => file.name !== targetName && ![...controllers.keys()].some((key) => fileNameForKey(key) === file.name))
    .sort((a, b) => (lastAccess.get(a.name) ?? toMillis(a.modificationTime)) - (lastAccess.get(b.name) ?? toMillis(b.modificationTime)))
  let bytes = files.reduce((sum, file) => sum + (file.name === targetName ? 0 : Math.max(0, file.size ?? 0)), 0)
  let count = files.length - (existing ? 1 : 0)
  const victims: File[] = []
  for (const candidate of candidates) {
    if (bytes + incomingBytes <= MAX_ARTWORK_BYTES && count + 1 <= MAX_ARTWORK_FILES) break
    victims.push(candidate)
    bytes -= Math.max(0, candidate.size ?? 0)
    count -= 1
  }
  if (bytes + incomingBytes > MAX_ARTWORK_BYTES || count + 1 > MAX_ARTWORK_FILES) return false
  for (const victim of victims) {
    try {
      if (victim.exists) victim.delete()
      if (!victim.exists) lastAccess.delete(victim.name)
    } catch {
      // Keep failed deletions in the quota calculation below.
    }
  }
  try {
    files = artworkDir().list().filter((item): item is File => item instanceof File)
  } catch {
    return false
  }
  bytes = files.reduce((sum, file) => sum + (file.name === targetName ? 0 : Math.max(0, file.size ?? 0)), 0)
  count = files.filter((file) => file.name !== targetName).length
  return bytes + incomingBytes <= MAX_ARTWORK_BYTES && count + 1 <= MAX_ARTWORK_FILES
}

/** 返回可直接喂给 RNTP 的 file:// 地址；失败时返回 undefined（锁屏就没封面，不影响播放） */
export async function cacheArtwork(key: string, resource: HttpResource): Promise<string | undefined> {
  const existing = inflight.get(key)
  if (existing) return existing
  if (inflight.size >= MAX_PARALLEL_ARTWORK_DOWNLOADS) {
    // All callers are for the active song. A new selection takes priority over
    // an obsolete cover instead of permanently losing its lock-screen artwork.
    const oldestKey = inflight.keys().next().value
    if (oldestKey) {
      controllers.get(oldestKey)?.abort()
      await inflight.get(oldestKey)
    }
    return cacheArtwork(key, resource)
  }

  const task = (async () => {
    const generation = artworkGeneration
    const controller = new AbortController()
    controllers.set(key, controller)
    let target: File | undefined
    try {
      const targetName = fileNameForKey(key)
      target = new File(artworkDir(), targetName)
      if (target.exists) {
        lastAccess.set(targetName, Date.now())
        return target.uri
      }
      const bytes = await fetchBoundedBytes(resource.url, {
        headers: resource.headers,
        signal: controller.signal,
        timeoutMs: 15_000,
        maxBytes: MAX_ARTWORK_FILE_BYTES,
      })
      if (generation !== artworkGeneration || controller.signal.aborted || !makeRoom(bytes.byteLength, targetName)) return undefined
      target.write(bytes)
      lastAccess.set(targetName, Date.now())
      return generation === artworkGeneration && target.exists ? target.uri : undefined
    } catch {
      try {
        if (target?.exists) target.delete()
      } catch {
        // Partial image files are treated as stale quota entries.
      }
      return undefined
    }
  })()

  const tracked = task.finally(() => {
    controllers.delete(key)
    if (inflight.get(key) === tracked) inflight.delete(key)
  })
  inflight.set(key, tracked)
  return tracked
}

/** 设置里「清理缓存」会用到 */
export function clearArtworkCache(): boolean {
  artworkGeneration += 1
  for (const controller of controllers.values()) controller.abort()
  const dir = new Directory(Paths.cache, ARTWORK_DIR)
  try {
    if (dir.exists) dir.delete()
    if (dir.exists) return false
    lastAccess.clear()
    return true
  } catch {
    return false
  }
}
