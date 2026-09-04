import { Directory, File, Paths } from 'expo-file-system'
import type { HttpResource } from '@qj/core-domain'

/**
 * 锁屏封面必须是本地文件：RNTP 的 artwork 只接受 URL，不能带鉴权头，
 * 而飞牛的封面接口必须带头，所以先下载到缓存目录再交给播放器。
 */
const ARTWORK_DIR = 'artwork'

function artworkDir(): Directory {
  const dir = new Directory(Paths.cache, ARTWORK_DIR)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

function safeName(key: string): string {
  return `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.img`
}

const inflight = new Map<string, Promise<string | undefined>>()

/** 返回可直接喂给 RNTP 的 file:// 地址；失败时返回 undefined（锁屏就没封面，不影响播放） */
export async function cacheArtwork(key: string, resource: HttpResource): Promise<string | undefined> {
  const existing = inflight.get(key)
  if (existing) return existing

  const task = (async () => {
    try {
      const target = new File(artworkDir(), safeName(key))
      if (target.exists) return target.uri
      const downloaded = await File.downloadFileAsync(resource.url, target, { headers: resource.headers })
      return downloaded.uri
    } catch {
      return undefined
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

/** 设置里「清理缓存」会用到 */
export function clearArtworkCache(): void {
  const dir = new Directory(Paths.cache, ARTWORK_DIR)
  if (dir.exists) dir.delete()
}
